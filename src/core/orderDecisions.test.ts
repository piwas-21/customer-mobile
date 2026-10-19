import { customerOrderFixture, appliedOrder, checkoutIntent } from '../test/customerOrder';
import { currentBasketOwner, basketOperationId } from '../test/basketOperations';
import { secretKey } from './credentials';
import { SessionRepository } from './sessionRepository';
import { savedOrderLimit } from './orderDecisions';
import type { CustomerOrderResolution } from '../api/customerOrderOperation';
import { tenantB } from '../test/fixtures';
const applied = (): CustomerOrderResolution => ({
  ...appliedOrder(),
  schemaVersion: 1,
  outcome: 'Applied',
});
it('saves a minimal accepted receipt before releasing the pending proof and allows a later order', async () => {
  const f = await customerOrderFixture();
  await f.repository.orders.finish(f.context, f.principal, applied(), currentBasketOwner);
  expect(await f.repository.orders.load(f.context, f.principal, currentBasketOwner)).toBeNull();
  const decisions = await new SessionRepository(f.store).orders.decisions(
    f.context,
    f.principal,
    currentBasketOwner,
  );
  expect(decisions).toHaveLength(1);
  expect(decisions[0]?.orderId).toBe(applied().orderId);
  expect(JSON.stringify(decisions)).not.toContain('native@example.test');
  await f.repository.orders.finish(f.context, f.principal, applied(), currentBasketOwner);
  const next = await f.repository.orders.prepare(
    f.context,
    f.principal,
    { intent: checkoutIntent(), payloadHash: 'd'.repeat(64) },
    () => tenantB,
    currentBasketOwner,
  );
  expect(next.operationId).toBe(tenantB);
  await f.repository.orders.forgetDecision(
    f.context,
    f.principal,
    basketOperationId,
    currentBasketOwner,
  );
  expect(await f.repository.orders.decisions(f.context, f.principal, currentBasketOwner)).toEqual(
    [],
  );
  expect(
    (await f.repository.orders.load(f.context, f.principal, currentBasketOwner))?.proof.operationId,
  ).toBe(tenantB);
});
it.each([
  { outcome: 'Unseen' as const, orderId: null },
  { operationId: tenantB },
  { outcome: 'Cancelled' as const, orderId: applied().orderId },
])(
  'an unseen, substituted or contradictory outcome cannot release the pending order %j',
  async (patch) => {
    const f = await customerOrderFixture();
    await expect(
      f.repository.orders.finish(
        f.context,
        f.principal,
        { ...applied(), ...patch },
        currentBasketOwner,
      ),
    ).rejects.toThrow();
    expect(
      await f.repository.orders.load(f.context, f.principal, currentBasketOwner),
    ).not.toBeNull();
  },
);
it('failed receipt persistence preserves the pending proof and contact for explicit recovery', async () => {
  const f = await customerOrderFixture();
  const key = secretKey(f.context, 'order-decisions', f.principal);
  const write = f.store.set.bind(f.store);
  jest.spyOn(f.store, 'set').mockImplementation(async (name, value) => {
    if (name === key) throw new Error('Secure receipt save unavailable');
    await write(name, value);
  });
  await expect(
    f.repository.orders.finish(f.context, f.principal, applied(), currentBasketOwner),
  ).rejects.toThrow();
  expect(
    (await f.repository.orders.load(f.context, f.principal, currentBasketOwner))?.intent,
  ).toEqual(checkoutIntent());
});
it('failed proof removal can finish idempotently from the already-saved accepted receipt', async () => {
  const f = await customerOrderFixture();
  const key = secretKey(f.context, 'order-operation-proof', f.principal);
  const remove = f.store.remove.bind(f.store);
  let fail = true;
  jest.spyOn(f.store, 'remove').mockImplementation(async (name) => {
    if (name === key && fail) {
      fail = false;
      throw new Error('Secure removal unavailable');
    }
    await remove(name);
  });
  await expect(
    f.repository.orders.finish(f.context, f.principal, applied(), currentBasketOwner),
  ).rejects.toThrow();
  expect(
    await f.repository.orders.decisions(f.context, f.principal, currentBasketOwner),
  ).toHaveLength(1);
  expect(
    (await f.repository.orders.load(f.context, f.principal, currentBasketOwner))?.intent,
  ).toBeNull();
  await f.repository.orders.finish(f.context, f.principal, applied(), currentBasketOwner);
  expect(await f.repository.orders.load(f.context, f.principal, currentBasketOwner)).toBeNull();
  expect(
    await f.repository.orders.decisions(f.context, f.principal, currentBasketOwner),
  ).toHaveLength(1);
});
it('a conflicting repeated decision cannot overwrite accepted history', async () => {
  const f = await customerOrderFixture();
  await f.repository.orders.finish(f.context, f.principal, applied(), currentBasketOwner);
  await expect(
    f.repository.orders.finish(
      f.context,
      f.principal,
      { ...applied(), outcome: 'Cancelled', orderId: null },
      currentBasketOwner,
    ),
  ).rejects.toThrow();
});
it('a full bounded receipt history blocks new preparation until an explicit resolved receipt removal', async () => {
  const f = await customerOrderFixture();
  await f.repository.orders.finish(f.context, f.principal, applied(), currentBasketOwner);
  const [base] = await f.repository.orders.decisions(f.context, f.principal, currentBasketOwner);
  const full = Array.from({ length: savedOrderLimit }, (_, index) => ({
    ...base,
    operationId: `33333333-3333-4333-8333-${index.toString(16).padStart(12, '0')}`,
  }));
  await f.store.set(secretKey(f.context, 'order-decisions', f.principal), JSON.stringify(full));
  await expect(
    f.repository.orders.prepare(
      f.context,
      f.principal,
      { intent: checkoutIntent(), payloadHash: 'd'.repeat(64) },
      () => tenantB,
      currentBasketOwner,
    ),
  ).rejects.toThrow('Manage saved');
  await f.repository.orders.forgetDecision(
    f.context,
    f.principal,
    full[0]!.operationId,
    currentBasketOwner,
  );
  await f.repository.orders.prepare(
    f.context,
    f.principal,
    { intent: checkoutIntent(), payloadHash: 'd'.repeat(64) },
    () => tenantB,
    currentBasketOwner,
  );
});
