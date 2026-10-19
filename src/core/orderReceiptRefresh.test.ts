import { CustomerTransport } from './transport';
import { TenantBoundary } from './tenantContext';
import { parseDirectory } from './directory';
import { directoryInput, tenantA } from '../test/fixtures';
import { decisionProof } from './orderDecisions';
import { signIn, refreshSession } from '../api/auth';
import { z } from 'zod';
import { OrderReceiptController } from './orderReceiptController';
import { SessionController } from './sessionController';
import { savedOrderFixture, receiptResponse } from '../test/orderReceipt';
import { authResponse, session, renewed } from '../test/sessions';
import { response } from '../test/transport';
import { basketOperationId } from '../test/basketOperations';
import { deferred } from '../test/deferred';
async function fixture(accounts = true) {
  const f = await savedOrderFixture(true);
  const sessions = new SessionController(f.context, f.client, f.repository, accounts);
  await sessions.initialize();
  const reader = new OrderReceiptController(f.context, f.repository, sessions, f.principal);
  return { ...f, sessions, reader };
}
it.each([true, false])(
  'renews expired receipt authentication after restart, accounts=%s, without changing original proof',
  async (accounts) => {
    const f = await fixture(accounts);
    f.fetcher.mockImplementation(async (url, options) =>
      url.endsWith('/refresh-token')
        ? authResponse()
        : options.headers?.Authorization === `Bearer ${session.accessToken}`
          ? response({}, 401)
          : response({ success: true, data: receiptResponse() }),
    );
    const values = await Promise.all([
      f.reader.read(basketOperationId, 'en'),
      f.reader.read(basketOperationId, 'en'),
    ]);
    expect(values.map((value) => value.paymentStatus)).toEqual(['Pending', 'Pending']);
    const refreshes = f.fetcher.mock.calls.filter(([url]) => url.endsWith('/refresh-token'));
    expect(refreshes).toHaveLength(1);
    expect(JSON.parse(refreshes[0]![1].body!)).toEqual({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    });
    const reads = f.fetcher.mock.calls.filter(([url]) => url.endsWith('/receipt'));
    expect(reads).toHaveLength(4);
    expect(new Set(reads.map(([, options]) => options.body)).size).toBe(1);
    expect(new Set(reads.map(([, options]) => options.headers?.['X-Session-Id']))).toEqual(
      new Set([f.decision.sessionId]),
    );
    expect(
      reads
        .slice(2)
        .every(([, options]) => options.headers?.Authorization === `Bearer ${renewed.accessToken}`),
    ).toBe(true);
    expect(await f.repository.load(f.context)).toEqual(renewed);
    expect(
      f.fetcher.mock.calls.every(
        ([url]) => url.endsWith('/receipt') || url.endsWith('/refresh-token'),
      ),
    ).toBe(true);
  },
);
it.each([403, 404, 503])('never refreshes or retries receipt HTTP %s', async (status) => {
  const f = await fixture();
  f.fetcher.mockResolvedValue(response({}, status));
  await expect(f.reader.read(basketOperationId, 'en')).rejects.toMatchObject({ status });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  expect(await f.repository.load(f.context)).toEqual(session);
});
it('retries a 401 receipt once and keeps an unresolved second 401 visible', async () => {
  const f = await fixture(false);
  f.fetcher.mockImplementation(async (url) =>
    url.endsWith('/refresh-token') ? authResponse() : response({}, 401),
  );
  await expect(f.reader.read(basketOperationId, 'en')).rejects.toMatchObject({ status: 401 });
  expect(f.fetcher).toHaveBeenCalledTimes(3);
});
it('invalid refresh clears the original credentials without a receipt or checkout retry', async () => {
  const f = await fixture(false);
  f.fetcher.mockResolvedValue(response({}, 401));
  await expect(f.reader.read(basketOperationId, 'en')).rejects.toMatchObject({ status: 401 });
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  expect(f.sessions.userId).toBeNull();
  expect(await f.repository.loadForOrderRecovery(f.context)).toBeNull();
});
it('cannot publish a renewal or retry the receipt after logout during refresh', async () => {
  const f = await fixture(false);
  const refreshing = deferred<void>();
  const reply = deferred<Response>();
  f.fetcher.mockImplementation(async (url) => {
    if (url.endsWith('/refresh-token')) {
      refreshing.resolve();
      return reply.promise;
    }
    return response({}, 401);
  });
  const pending = f.reader.read(basketOperationId, 'en');
  await refreshing.promise;
  await f.sessions.logout();
  reply.resolve(authResponse());
  await expect(pending).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  expect(await f.repository.load(f.context)).toBeNull();
});

it('does not exchange credentials for a forgotten receipt or a local owner refusal', async () => {
  const f = await fixture(false);
  await f.reader.forget(basketOperationId);
  await expect(f.sessions.receipt(f.decision, 'en')).rejects.toMatchObject({ reason: 'refused' });
  expect(f.fetcher).not.toHaveBeenCalled();
});

it('renews only an owned saved receipt in an actual read-only directory tenant', async () => {
  const f = await fixture(false);
  const input = directoryInput();
  input.tenants[0]!.status = 'read-only';
  const boundary = new TenantBoundary(parseDirectory(input, 'staging'));
  const context = boundary.select(tenantA);
  const client = new CustomerTransport(boundary, f.repository.vault, f.fetcher);
  const sessions = new SessionController(context, client, f.repository, false, true);
  await sessions.initialize();
  const reader = new OrderReceiptController(context, f.repository, sessions, f.principal);
  f.fetcher.mockImplementation(async (url, options) =>
    url.endsWith('/refresh-token')
      ? authResponse()
      : options.headers?.Authorization === `Bearer ${session.accessToken}`
        ? response({}, 401)
        : response({ success: true, data: receiptResponse() }),
  );
  expect(context.tenant.status).toBe('read-only');
  expect((await reader.read(basketOperationId, 'en')).orderNumber).toBe('20261019-001');
  expect(f.fetcher).toHaveBeenCalledTimes(3);
  expect(f.fetcher.mock.calls[1]![1].headers).not.toHaveProperty('Authorization');
  expect(f.fetcher.mock.calls[1]![1].headers?.['X-Session-Id']).toBe(f.decision.sessionId);
  await expect(
    signIn(client, context, { email: 'fixture@example.test', password: 'password' }, 'en'),
  ).rejects.toThrow('read-only');
  await expect(refreshSession(client, context, renewed)).rejects.toThrow('read-only');
  await expect(
    client.request(context, '/api/customer-mobile/checkout/submit', z.unknown(), {
      method: 'POST',
      credentials: 'receipt-renewal',
      principal: f.principal,
      expectedOrderProof: decisionProof(f.decision),
      assertCurrent: reader.assertCurrent,
    }),
  ).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(3);
});
it('withdraws credential renewal before dispatch when logout occurs during its proof-header await', async () => {
  const f = await fixture(false);
  const entered = deferred<void>();
  const gate = deferred<void>();
  const original = f.repository.vault.orderReceiptRecords.bind(f.repository.vault);
  let reads = 0;
  jest.spyOn(f.repository.vault, 'orderReceiptRecords').mockImplementation(async (...args) => {
    const captured = await original(...args);
    if (++reads === 2) {
      entered.resolve();
      await gate.promise;
    }
    return captured;
  });
  f.fetcher.mockResolvedValue(response({}, 401));
  const pending = f.reader.read(basketOperationId, 'en');
  await entered.promise;
  await f.sessions.logout();
  gate.resolve();
  await expect(pending).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  expect(await f.repository.load(f.context)).toBeNull();
});
