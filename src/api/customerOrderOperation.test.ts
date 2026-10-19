import { recoverCustomerOrder, submitCustomerOrder } from './customerOrderOperation';
import { customerOrderFixture, appliedOrder } from '../test/customerOrder';
import { currentBasketOwner } from '../test/basketOperations';
import { response } from '../test/transport';
import { secretKey } from '../core/credentials';
import { tenantB } from '../test/fixtures';
it('submits one exact prepared intent with its secure original operation identity and no automatic retry', async () => {
  const f = await customerOrderFixture();
  f.fetcher.mockResolvedValue(response({ success: true, data: appliedOrder() }));
  await expect(
    submitCustomerOrder(f.client, f.context, f.pending, currentBasketOwner, 'en'),
  ).resolves.toEqual(appliedOrder());
  const [url, options] = f.fetcher.mock.calls[0]!;
  expect(url).toContain('/api/customer-mobile/checkout/submit');
  expect(options.headers?.['X-Session-Id']).toBe(f.pending.sessionId);
  expect(JSON.parse(options.body!)).toEqual({
    schemaVersion: 1,
    operationId: f.pending.operationId,
    payloadHash: f.pending.payloadHash,
    intent: f.pending.intent,
  });
  f.fetcher.mockRejectedValue(new Error('Lost response'));
  await expect(
    submitCustomerOrder(f.client, f.context, f.pending, currentBasketOwner, 'en'),
  ).rejects.toMatchObject({ reason: 'network' });
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  expect(await f.repository.orders.load(f.context, f.principal, currentBasketOwner)).not.toBeNull();
});
it.each([
  { operationId: tenantB },
  { orderId: null },
  { outcome: 'Unseen', orderId: null },
  { outcome: 'Cancelled', orderId: null },
  { total: 0 },
])('refuses substituted or contradictory acceptance proof %j', async (patch) => {
  const f = await customerOrderFixture();
  f.fetcher.mockResolvedValue(response({ success: true, data: { ...appliedOrder(), ...patch } }));
  await expect(
    submitCustomerOrder(f.client, f.context, f.pending, currentBasketOwner, 'en'),
  ).rejects.toMatchObject({ reason: 'contract' });
});
it('recovers using only operation proof after contact and the ordinary basket session are removed', async () => {
  const f = await customerOrderFixture(true);
  await f.repository.vault.clear(f.context, f.principal);
  // A new authenticated session for the same account is required; the old JWT was purged.
  await f.repository.vault.saveSession(f.context, {
    userId: f.principal.id,
    accessToken: 'new-access',
    refreshToken: 'new-refresh',
  });
  const loaded = await f.repository.orders.load(f.context, f.principal, currentBasketOwner);
  expect(loaded?.intent).toBeNull();
  f.fetcher.mockResolvedValue(response({ success: true, data: appliedOrder() }));
  await expect(
    recoverCustomerOrder(f.client, f.context, loaded!.proof, currentBasketOwner, 'en'),
  ).resolves.toEqual(appliedOrder());
  const [, options] = f.fetcher.mock.calls[0]!;
  expect(options.headers?.['X-Session-Id']).toBe(f.pending.sessionId);
  expect(options.headers?.Authorization).toBe('Bearer new-access');
  expect(JSON.parse(options.body!)).toEqual({
    schemaVersion: 1,
    operationId: f.pending.operationId,
    payloadHash: f.pending.payloadHash,
  });
  expect(options.body).not.toContain('native@example.test');
});
it('durably requested cancellation cannot resume submission and recovery uses the cancellation endpoint', async () => {
  const f = await customerOrderFixture();
  const cancelling = await f.repository.orders.requestCancellation(
    f.context,
    f.principal,
    f.pending.operationId,
    currentBasketOwner,
  );
  await expect(
    submitCustomerOrder(f.client, f.context, f.pending, currentBasketOwner, 'en'),
  ).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
  f.fetcher.mockResolvedValue(
    response({ success: true, data: { ...appliedOrder(), outcome: 'Cancelled', orderId: null } }),
  );
  await recoverCustomerOrder(f.client, f.context, cancelling, currentBasketOwner, 'en');
  expect(f.fetcher.mock.calls[0]![0]).toContain('/checkout/cancel');
  expect(
    (await f.repository.orders.load(f.context, f.principal, currentBasketOwner))?.intent,
  ).toBeNull();
});
it.each([{ sessionId: tenantB }, { payloadHash: 'd'.repeat(64) }, { cancellationRequested: true }])(
  'refuses a changed secure proof before dispatch %j',
  async (patch) => {
    const f = await customerOrderFixture();
    const { intent: _intent, ...proof } = f.pending;
    await f.store.set(
      secretKey(f.context, 'order-operation-proof', f.principal),
      JSON.stringify({ ...proof, ...patch }),
    );
    await expect(
      submitCustomerOrder(f.client, f.context, f.pending, currentBasketOwner, 'en'),
    ).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
