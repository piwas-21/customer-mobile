import { paymentFixture, paymentDecision } from '../test/customerPayment';
import { SessionController } from './sessionController';
import { authResponse, renewed, session } from '../test/sessions';
import { response } from '../test/transport';
import { deferred } from '../test/deferred';
import { secretKey } from './credentials';
import { CustomerTransport } from './transport';
import { TenantBoundary } from './tenantContext';
import { parseDirectory } from './directory';
import { directoryInput, tenantA } from '../test/fixtures';
async function fixture(readOnly = false) {
  const f = await paymentFixture(true);
  const raw = directoryInput();
  if (readOnly) raw.tenants[0]!.status = 'read-only';
  const boundary = new TenantBoundary(parseDirectory(raw, 'staging'));
  const context = boundary.select(tenantA);
  const client = new CustomerTransport(boundary, f.repository.vault, f.fetcher);
  await f.store.remove(secretKey(f.context, 'order-decisions', f.principal));
  const sessions = new SessionController(context, client, f.repository, false, true);
  await sessions.initialize();
  return { ...f, context, sessions };
}
it.each([false, true])('renews payment proof once in parallel, readonly=%s', async (readonly) => {
  const f = await fixture(readonly);
  // Payment recovery remains independent of retained receipt history.
  await f.store.remove(secretKey(f.context, 'order-decisions', f.principal));
  f.fetcher.mockImplementation(async (url, options) =>
    url.endsWith('/refresh-token')
      ? authResponse()
      : options.headers?.Authorization === `Bearer ${session.accessToken}`
        ? response({}, 401)
        : response({ success: true, data: paymentDecision('paid') }),
  );
  expect(
    await Promise.all([
      f.sessions.recovery.payment(f.record, 'en'),
      f.sessions.recovery.payment(f.record, 'en'),
    ]),
  ).toEqual([paymentDecision('paid'), paymentDecision('paid')]);
  const refreshes = f.fetcher.mock.calls.filter(([url]) => url.endsWith('/refresh-token'));
  expect(refreshes).toHaveLength(1);
  expect(refreshes[0]![1].headers?.['X-Session-Id']).toBe(f.record.proof.sessionId);
  expect(refreshes[0]![1].headers).not.toHaveProperty('Authorization');
  expect(JSON.parse(refreshes[0]![1].body!)).toEqual({
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  });
  const reads = f.fetcher.mock.calls.filter(([url]) => url.endsWith('/payment/recover'));
  expect(reads).toHaveLength(4);
  expect(new Set(reads.map(([, options]) => options.body)).size).toBe(1);
  expect(new Set(reads.map(([, options]) => options.headers?.['X-Session-Id']))).toEqual(
    new Set([f.pending.sessionId]),
  );
  expect(await f.repository.load(f.context)).toEqual(renewed);
});
it.each([403, 404, 503])('never renews or retries a payment HTTP %s', async (status) => {
  const f = await fixture();
  f.fetcher.mockResolvedValue(response({}, status));
  await expect(f.sessions.recovery.payment(f.record, 'en')).rejects.toMatchObject({ status });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it('retries exactly once after an HTTP 401, retains the attempt on a second refusal', async () => {
  const f = await fixture();
  f.fetcher.mockImplementation(async (url) =>
    url.endsWith('/refresh-token') ? authResponse() : response({}, 401),
  );
  await expect(f.sessions.recovery.payment(f.record, 'en')).rejects.toMatchObject({ status: 401 });
  expect(f.fetcher).toHaveBeenCalledTimes(3);
  expect(await f.repository.payments.load(f.context, f.principal, () => {})).toEqual(f.record);
});
it('logout during renewal withdraws publication and retry but preserves the pending attempt', async () => {
  const f = await fixture();
  const entered = deferred<void>();
  const reply = deferred<Response>();
  f.fetcher.mockImplementation(async (url) => {
    if (url.endsWith('/refresh-token')) {
      entered.resolve();
      return reply.promise;
    }
    return response({}, 401);
  });
  const pending = f.sessions.recovery.payment(f.record, 'en');
  await entered.promise;
  await f.sessions.logout();
  reply.resolve(authResponse());
  await expect(pending).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  expect(await f.repository.load(f.context)).toBeNull();
  expect(await f.repository.payments.load(f.context, f.principal, () => {})).toEqual(f.record);
});
it('invalid refresh removes credentials while retaining the original private attempt', async () => {
  const f = await fixture();
  f.fetcher.mockResolvedValue(response({}, 401));
  await expect(f.sessions.recovery.payment(f.record, 'en')).rejects.toMatchObject({ status: 401 });
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  expect(f.sessions.userId).toBeNull();
  expect(await f.repository.payments.load(f.context, f.principal, () => {})).toEqual(f.record);
});
