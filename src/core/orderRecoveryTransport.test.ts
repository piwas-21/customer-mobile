import { parseDirectory } from './directory';
import { z } from 'zod';
import { CustomerTransport } from './transport';
import { TenantBoundary } from './tenantContext';
import { directoryInput, tenantA, tenantB } from '../test/fixtures';
import { customerOrderFixture, appliedOrder } from '../test/customerOrder';
import { currentBasketOwner } from '../test/basketOperations';
import { recoverCustomerOrder, submitCustomerOrder } from '../api/customerOrderOperation';
import { response } from '../test/transport';
import { deferred } from '../test/deferred';
function readOnly() {
  const input = directoryInput();
  input.tenants[0]!.status = 'read-only';
  const boundary = new TenantBoundary(parseDirectory(input, 'staging'));
  return { boundary, context: boundary.select(tenantA) };
}
it('a read-only restaurant permits only original owner-bound recovery and cancellation, never another purchase', async () => {
  const f = await customerOrderFixture();
  const { boundary, context } = readOnly();
  expect(context.tenant.status).toBe('read-only');
  const client = new CustomerTransport(boundary, f.repository.vault, f.fetcher);
  const { intent: _intent, ...proof } = f.pending;
  f.fetcher.mockResolvedValue(response({ success: true, data: appliedOrder() }));
  await expect(
    recoverCustomerOrder(client, context, proof, currentBasketOwner, 'en'),
  ).resolves.toEqual(appliedOrder());
  await expect(
    submitCustomerOrder(client, context, f.pending, currentBasketOwner, 'en'),
  ).rejects.toThrow('read-only');
  const cancelling = await f.repository.orders.requestCancellation(
    context,
    f.principal,
    proof.operationId,
    currentBasketOwner,
  );
  await expect(
    recoverCustomerOrder(client, context, cancelling, currentBasketOwner, 'en'),
  ).resolves.toEqual(appliedOrder());
  await expect(
    client.request(context, '/api/orders', z.unknown(), {
      method: 'POST',
      credentials: 'order',
      principal: f.principal,
      expectedOrderProof: proof,
    }),
  ).rejects.toThrow('read-only');
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});
it('captures the entire original proof before awaiting customer credentials and refuses a replaced proof', async () => {
  const f = await customerOrderFixture(true);
  const gate = deferred<{ userId: string; accessToken: string; refreshToken: string } | null>();
  jest.spyOn(f.repository.vault, 'session').mockReturnValueOnce(gate.promise);
  const { intent: _intent, ...proof } = f.pending;
  const options = {
    method: 'POST' as const,
    credentials: 'order' as const,
    principal: f.principal,
    expectedOrderProof: proof,
  };
  const request = f.client.request(
    f.context,
    '/api/customer-mobile/checkout/recover',
    z.unknown(),
    options,
  );
  options.expectedOrderProof.sessionId = tenantB;
  gate.resolve({ userId: f.principal.id, accessToken: 'access', refreshToken: 'refresh' });
  f.fetcher.mockResolvedValue(response({ success: true, data: appliedOrder() }));
  await request;
  expect(f.fetcher.mock.calls[0]![1].headers?.['X-Session-Id']).toBe(f.pending.sessionId);
});
it('does not accept an order proof in unrelated credential modes or for another principal', async () => {
  const f = await customerOrderFixture();
  const { intent: _intent, ...proof } = f.pending;
  await expect(
    f.client.request(f.context, '/api/customer-mobile/checkout/recover', z.unknown(), {
      credentials: 'none',
      expectedOrderProof: proof,
    }),
  ).rejects.toThrow();
  await expect(
    f.client.request(f.context, '/api/customer-mobile/checkout/recover', z.unknown(), {
      credentials: 'order',
      expectedOrderProof: proof,
      principal: { kind: 'guest', id: 'another' },
    }),
  ).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
});
