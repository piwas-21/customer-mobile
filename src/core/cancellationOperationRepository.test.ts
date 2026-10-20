import { cancellationStorageFixture } from '../test/cancellationStorage';
import { cancellationRecord } from '../test/cancellation';
import { tenantB } from '../test/fixtures';
import { basketInput } from '../test/basketOperations';
import { checkoutIntent } from '../test/customerOrder';
import { secretKey } from './credentials';
import { SessionRepository } from './sessionRepository';
it.each([false, true])(
  'saves an exact original intent for the guest or signed history owner (%p)',
  async (customer) => {
    const f = cancellationStorageFixture(customer);
    const pending = await f.prepare();
    expect(pending.intent).toEqual(f.record.intent);
    const restored = new SessionRepository(f.store);
    expect(await restored.cancellations.load(f.context, f.principal, f.guard)).toEqual(pending);
    await expect(
      restored.orders.hasUnresolvedPurchase(f.context, f.principal, f.guard),
    ).resolves.toBe(true);
    const createId = jest.fn(() => tenantB);
    await expect(
      restored.cancellations.prepare(
        f.context,
        f.principal,
        f.record.authority,
        f.preparation,
        createId,
        f.guard,
      ),
    ).rejects.toThrow();
    expect(createId).not.toHaveBeenCalled();
  },
);
it('does not borrow a missing receipt or retarget its proof at another order', async () => {
  const f = cancellationStorageFixture();
  const key = secretKey(f.context, 'order-decisions', f.principal);
  f.store.values.delete(key);
  await expect(f.prepare()).rejects.toThrow('Original order receipt changed');
  expect(await f.repository.cancellations.load(f.context, f.principal, f.guard)).toBeNull();
});
it.each([true, false])(
  'serializes competing basket and cancellation claims on one secure queue (%p)',
  async (cancelFirst) => {
    const f = cancellationStorageFixture(true);
    const basket = () =>
      f.repository.baskets.prepare(f.context, f.principal, basketInput, () => tenantB, f.guard);
    const operations = cancelFirst ? [f.prepare(), basket()] : [basket(), f.prepare()];
    const result = await Promise.allSettled(operations);
    expect(result.map((value) => value.status)).toEqual(['fulfilled', 'rejected']);
  },
);
it('blocks order acceptance and basket changes until the original cancellation resolves', async () => {
  const f = cancellationStorageFixture(true);
  const pending = await f.prepare();
  const createId = jest.fn(() => tenantB);
  await expect(
    f.repository.baskets.prepare(f.context, f.principal, basketInput, createId, f.guard),
  ).rejects.toThrow();
  await expect(
    f.repository.orders.prepare(
      f.context,
      f.principal,
      { intent: checkoutIntent(), payloadHash: 'a'.repeat(64) },
      createId,
      f.guard,
    ),
  ).rejects.toThrow();
  expect(createId).not.toHaveBeenCalled();
  expect(() =>
    f.repository.cancellations.finish(
      f.context,
      pending,
      {
        schemaVersion: 1,
        operationId: pending.intent.operationId,
        orderId: pending.intent.orderId,
        outcome: 'Unseen',
        observedVersion: null,
        reason: null,
      },
      f.guard,
    ),
  ).toThrow();
  expect(
    (await f.repository.cancellations.load(f.context, f.principal, f.guard))?.resolution,
  ).toBeNull();
});
it('retains a saved nonce when acknowledgement is lost and cannot mint a replacement', async () => {
  const f = cancellationStorageFixture(true);
  const write = f.store.set;
  let fail = true;
  f.store.set = async (key, value) => {
    await write(key, value);
    if (key.endsWith('.order-cancellation') && fail) {
      fail = false;
      throw new Error('Lost acknowledgement');
    }
  };
  await expect(f.prepare()).rejects.toThrow('Lost acknowledgement');
  expect(
    (await new SessionRepository(f.store).cancellations.load(f.context, f.principal, f.guard))
      ?.intent,
  ).toEqual(f.record.intent);
  await expect(f.prepare()).rejects.toThrow('Resolve the original order action first');
});
it('keeps both refused and cancelled decisions immutable and allows exact repeated acknowledgement', async () => {
  const f = cancellationStorageFixture(true);
  const pending = await f.prepare();
  const refused = {
    schemaVersion: 1 as const,
    operationId: pending.intent.operationId,
    orderId: pending.intent.orderId,
    outcome: 'Refused' as const,
    observedVersion: 9,
    reason: 'OrderChanged' as const,
  };
  const resolved = await f.repository.cancellations.finish(f.context, pending, refused, f.guard);
  expect(await f.repository.cancellations.finish(f.context, pending, refused, f.guard)).toEqual(
    resolved,
  );
  await expect(
    f.repository.cancellations.finish(
      f.context,
      pending,
      { ...refused, outcome: 'Cancelled', reason: null },
      f.guard,
    ),
  ).rejects.toThrow('Conflicting canonical');
  expect(
    (await f.repository.cancellations.load(f.context, f.principal, f.guard))?.resolution,
  ).toEqual(refused);
  expect(await f.repository.orders.hasUnresolvedPurchase(f.context, f.principal, f.guard)).toBe(
    false,
  );
});
it('treats malformed pending storage as a hold rather than an absent operation', async () => {
  const f = cancellationStorageFixture(true);
  f.store.values.set(secretKey(f.context, 'order-cancellation', f.principal), '{invalid');
  await expect(
    f.repository.orders.hasUnresolvedPurchase(f.context, f.principal, f.guard),
  ).rejects.toThrow();
  await expect(
    f.repository.baskets.prepare(f.context, f.principal, basketInput, () => tenantB, f.guard),
  ).rejects.toThrow();
  await expect(f.prepare()).rejects.toThrow();
});
it('cannot use guest history authority or replace a resolved operation with its old nonce', async () => {
  const f = cancellationStorageFixture();
  await expect(
    f.repository.cancellations.prepare(
      f.context,
      f.principal,
      { kind: 'customer' },
      f.preparation,
      () => tenantB,
      f.guard,
    ),
  ).rejects.toThrow();
  const signed = cancellationRecord(true);
  const g = cancellationStorageFixture(true);
  const pending = await g.prepare();
  await g.repository.cancellations.finish(
    g.context,
    pending,
    {
      schemaVersion: 1,
      operationId: signed.intent.operationId,
      orderId: signed.intent.orderId,
      outcome: 'Cancelled',
      observedVersion: 8,
      reason: null,
    },
    g.guard,
  );
  await expect(g.prepare()).rejects.toThrow('identity was reused');
});
