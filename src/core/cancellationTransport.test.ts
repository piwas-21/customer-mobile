import { z } from 'zod';
import { CustomerTransport, type RequestOptions } from './transport';
import { cancellationBody } from './cancellationRequest';
import { cancellationStorageFixture } from '../test/cancellationStorage';
import { deferred } from '../test/deferred';
import { secretKey } from './credentials';
import { response } from '../test/transport';

async function setup(customer = false) {
  const fixture = cancellationStorageFixture(customer);
  const record = await fixture.prepare();
  const fetcher = jest.fn().mockResolvedValue(response({ success: true, data: 'canonical' }));
  const client = new CustomerTransport(fixture.boundary, fixture.repository.vault, fetcher);
  const path = `/api/customer-mobile/orders/cancellation/${customer ? '' : 'original/'}recover`;
  const options: RequestOptions = {
    method: 'POST',
    credentials: 'order-cancellation',
    principal: record.principal,
    expectedCancellationRecord: record,
    body: cancellationBody(record),
    assertCurrent: fixture.guard,
  };
  const session = { userId: record.principal.id, accessToken: 'access', refreshToken: 'refresh' };
  if (customer) await fixture.repository.activate(fixture.context, session, () => true);
  const request = (extra: RequestOptions = {}, destination = path) =>
    client.request(fixture.context, destination, z.string(), { ...options, ...extra });
  return { ...fixture, record, options, path, fetcher, client, request, session };
}

it.each([false, true])(
  'dispatches only the persisted action with its original authority (customer=%s)',
  async (customer) => {
    const { request, record, fetcher, path, store, context } = await setup(customer);
    // Ordinary receipt/session cleanup cannot replace the pending capsule's original authority.
    store.values.delete(secretKey(context, 'order-decisions', record.principal));
    expect(await request()).toBe('canonical');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, wire] = fetcher.mock.calls[0];
    expect(new URL(url).pathname).toBe(path);
    expect(JSON.parse(wire.body)).toEqual(cancellationBody(record));
    expect(wire.headers.Authorization).toBe(customer ? 'Bearer access' : undefined);
    expect(wire.headers['X-Session-Id']).toBe(
      record.authority.kind === 'original' ? record.authority.proof.sessionId : undefined,
    );
  },
);

it.each([
  '/api/Orders/cancel',
  '/api/customer-mobile/orders/cancellation/submit?extra=1',
  '/api/customer-mobile/orders/cancellation/submit',
  '/api/Auth/refresh-token',
])('refuses a pending capsule at another destination: %s', async (path) => {
  const { request, fetcher } = await setup();
  await expect(request({}, path)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

it('refuses a changed body, owner, method, guard or stored decision before dispatch', async () => {
  const { request, options, fetcher, store, record, context } = await setup();
  const cases: RequestOptions[] = [
    { body: { ...(options.body as object), extra: true } },
    { body: { ...cancellationBody(record), intent: { ...record.intent, expectedVersion: 8 } } },
    { principal: { kind: 'guest', id: 'another' } },
    { method: 'GET' },
  ];
  for (const candidate of cases) await expect(request(candidate)).rejects.toThrow();
  const key = secretKey(context, 'order-cancellation', record.principal);
  const saved = store.values.get(key)!;
  store.values.set(
    key,
    JSON.stringify({ ...record, intent: { ...record.intent, payloadHash: 'd'.repeat(64) } }),
  );
  await expect(request()).rejects.toThrow();
  store.values.set(
    key,
    JSON.stringify({
      ...record,
      resolution: {
        schemaVersion: 1,
        operationId: record.intent.operationId,
        orderId: record.intent.orderId,
        outcome: 'Cancelled',
        observedVersion: 8,
        reason: null,
      },
    }),
  );
  await expect(request()).rejects.toThrow();
  store.values.set(key, saved);
  expect(await request()).toBe('canonical');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('snapshots the wire and expected record before a secure read yields', async () => {
  const { request, record, options, store, fetcher, context } = await setup();
  const gate = deferred<string | null>();
  const get = store.get;
  jest.spyOn(store, 'get').mockImplementationOnce(() => gate.promise);
  const pending = request();
  record.intent.expectedVersion = 22;
  (options.body as { intent: { expectedVersion: number } }).intent.expectedVersion = 23;
  gate.resolve(await get(secretKey(context, 'order-cancellation', record.principal)));
  expect(await pending).toBe('canonical');
  expect(JSON.parse(fetcher.mock.calls[0][1].body).intent.expectedVersion).toBe(7);
});

it('refuses a signed action after credential removal without guest fallback', async () => {
  const { request, repository, context, record, fetcher } = await setup(true);
  await repository.vault.removeSession(context, record.principal.id);
  await expect(request()).rejects.toMatchObject({ reason: 'refused' });
  expect(fetcher).not.toHaveBeenCalled();
});

it('confines renewal to the same stored customer and current token pair', async () => {
  const { request, session, fetcher, options } = await setup(true);
  const renewal: RequestOptions = {
    credentials: 'cancellation-renewal',
    body: { accessToken: session.accessToken, refreshToken: session.refreshToken },
  };
  await expect(
    request({ ...renewal, body: { ...session } }, '/api/Auth/refresh-token'),
  ).rejects.toThrow();
  await expect(
    request(
      { ...renewal, body: { accessToken: 'another', refreshToken: 'refresh' } },
      '/api/Auth/refresh-token',
    ),
  ).rejects.toThrow();
  await expect(request(renewal, '/api/Profile')).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  expect(await request(renewal, '/api/Auth/refresh-token')).toBe('canonical');
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBeUndefined();
  await expect(request({ ...options, credentials: 'customer' })).rejects.toThrow();
});
