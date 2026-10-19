import { OrderReceiptController } from './orderReceiptController';
import { deferred } from '../test/deferred';
import { session } from '../test/sessions';
import { currentBasketOwner } from '../test/basketOperations';
import { z } from 'zod';
import { savedOrderFixture } from '../test/orderReceipt';
import { decisionProof } from './orderDecisions';
import { tenantB } from '../test/fixtures';
import { secretKey } from './credentials';
import { response } from '../test/transport';
it.each([
  'guest',
  'forgotten',
  'wrong-hash',
  'wrong-principal',
  'missing-owner',
  'wrong-method',
  'wrong-route',
] as const)('receipt-only credential renewal refuses %s before any packet', async (mode) => {
  const f = await savedOrderFixture(mode !== 'guest');
  const proof = decisionProof(f.decision);
  if (mode === 'forgotten')
    await f.store.remove(secretKey(f.context, 'order-decisions', f.principal));
  f.fetcher.mockResolvedValue(response({ success: true, data: {} }));
  await expect(
    f.client.request(
      f.context,
      mode === 'wrong-route' ? '/api/Auth/login' : '/api/Auth/refresh-token',
      z.unknown(),
      {
        method: mode === 'wrong-method' ? 'GET' : 'POST',
        credentials: 'receipt-renewal',
        principal: mode === 'wrong-principal' ? { kind: 'customer', id: tenantB } : f.principal,
        expectedOrderProof:
          mode === 'wrong-hash' ? { ...proof, payloadHash: 'a'.repeat(64) } : proof,
        ...(mode === 'missing-owner' ? {} : { assertCurrent: () => undefined }),
      },
    ),
  ).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
});

it('a locally forgotten proof during renewal preserves the customer session and other saved receipts', async () => {
  const f = await savedOrderFixture(true);
  const other = { ...f.decision, operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
  await f.store.set(
    secretKey(f.context, 'order-decisions', f.principal),
    JSON.stringify([f.decision, other]),
  );
  const entered = deferred<void>();
  const gate = deferred<string | null>();
  const original = f.repository.vault.orderReceiptRecords.bind(f.repository.vault);
  let reads = 0;
  jest.spyOn(f.repository.vault, 'orderReceiptRecords').mockImplementation(async (...args) => {
    if (++reads === 2) {
      entered.resolve();
      return gate.promise;
    }
    return original(...args);
  });
  const reader = new OrderReceiptController(f.context, f.repository, f.sessions, f.principal);
  f.fetcher.mockResolvedValue(response({}, 401));
  const pending = reader.read(f.decision.operationId, 'en');
  await entered.promise;
  await f.repository.orders.forgetDecision(
    f.context,
    f.principal,
    f.decision.operationId,
    currentBasketOwner,
  );
  gate.resolve(await original(f.context, f.principal));
  await expect(pending).rejects.toMatchObject({ reason: 'refused' });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  expect(f.sessions.userId).toBe(session.userId);
  expect(await f.repository.load(f.context)).toEqual(session);
  expect(await f.repository.orders.decisions(f.context, f.principal, currentBasketOwner)).toEqual([
    other,
  ]);
});
