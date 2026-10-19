import { secretKey } from './credentials';
import { customerOrderFixture, checkoutIntent } from '../test/customerOrder';
import { checkoutQuoteFixture } from '../test/checkoutQuote';
import { basketOperationId, currentBasketOwner } from '../test/basketOperations';
import { tenantB } from '../test/fixtures';
import { SessionRepository } from './sessionRepository';
import { session } from '../test/sessions';
it('restores the exact prepared request after restart and refuses replacement orders', async () => {
  const f = await customerOrderFixture();
  const restored = new SessionRepository(f.store);
  const loaded = await restored.orders.load(f.context, f.principal, currentBasketOwner);
  expect(loaded?.intent).toEqual(checkoutIntent());
  expect(loaded?.proof.operationId).toBe(basketOperationId);
  await expect(
    restored.orders.prepare(
      f.context,
      f.principal,
      { intent: checkoutIntent(), payloadHash: 'd'.repeat(64) },
      () => tenantB,
      currentBasketOwner,
    ),
  ).rejects.toThrow('pending order');
});
it('serializes preparation so two callers cannot create competing operations', async () => {
  const f = await checkoutQuoteFixture();
  const prepared = { intent: checkoutIntent(), payloadHash: 'c'.repeat(64) };
  const results = await Promise.allSettled([
    f.repository.orders.prepare(
      f.context,
      f.principal,
      prepared,
      () => basketOperationId,
      currentBasketOwner,
    ),
    f.repository.orders.prepare(
      f.context,
      f.principal,
      prepared,
      () => tenantB,
      currentBasketOwner,
    ),
  ]);
  expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
  expect(
    (await f.repository.orders.load(f.context, f.principal, currentBasketOwner))?.proof.operationId,
  ).toBe(basketOperationId);
});
it('actual durable logout removes contact and credentials but retains only the recoverable operation proof', async () => {
  const f = await customerOrderFixture(true);
  await f.sessions.logout();
  const loaded = await f.repository.orders.load(f.context, f.principal, currentBasketOwner);
  expect(loaded?.intent).toBeNull();
  expect(loaded?.proof.payloadHash).toBe(f.pending.payloadHash);
  expect(JSON.stringify(loaded?.proof)).not.toContain('native@example.test');
  expect(await f.repository.vault.session(f.context, session.userId)).toBeNull();
  expect(await f.repository.vault.capability(f.context, 'guest-session', f.principal)).toBeNull();
  expect(
    await f.repository.orders.load(
      f.context,
      { kind: 'guest', id: 'installation' },
      currentBasketOwner,
    ),
  ).toBeNull();
});
it.each(['environment', 'tenant', 'principal', 'contact-operation'])(
  'refuses corrupted or substituted journal scope %s',
  async (change) => {
    const f = await customerOrderFixture();
    if (change === 'contact-operation') {
      await f.store.set(
        secretKey(f.context, 'order-contact', f.principal),
        JSON.stringify({ operationId: tenantB, intent: checkoutIntent() }),
      );
    } else {
      const { intent: _intent, ...proof } = f.pending;
      const patch =
        change === 'environment'
          ? { environment: 'production' }
          : change === 'tenant'
            ? { tenantId: tenantB }
            : { principal: { kind: 'guest', id: 'another' } };
      await f.store.set(
        secretKey(f.context, 'order-operation-proof', f.principal),
        JSON.stringify({ ...proof, ...patch }),
      );
    }
    await expect(
      f.repository.orders.load(f.context, f.principal, currentBasketOwner),
    ).rejects.toThrow();
  },
);
it('refuses cancellation of a different operation and repeated cancellation retains its exact original proof', async () => {
  const f = await customerOrderFixture();
  await expect(
    f.repository.orders.requestCancellation(f.context, f.principal, tenantB, currentBasketOwner),
  ).rejects.toThrow();
  const first = await f.repository.orders.requestCancellation(
    f.context,
    f.principal,
    basketOperationId,
    currentBasketOwner,
  );
  const second = await f.repository.orders.requestCancellation(
    f.context,
    f.principal,
    basketOperationId,
    currentBasketOwner,
  );
  expect(first).toEqual(second);
  expect(first.cancellationRequested).toBe(true);
});
it('a saved proof with failed acknowledgement still blocks a replacement and can be recovered', async () => {
  const f = await checkoutQuoteFixture();
  const key = secretKey(f.context, 'order-operation-proof', f.principal);
  const read = f.store.get.bind(f.store);
  let fail = false;
  const write = f.store.set.bind(f.store);
  jest.spyOn(f.store, 'set').mockImplementation(async (name, value) => {
    await write(name, value);
    if (name === key) fail = true;
  });
  jest.spyOn(f.store, 'get').mockImplementation(async (name) => {
    if (name === key && fail) {
      fail = false;
      throw new Error('Acknowledgement lost');
    }
    return read(name);
  });
  await expect(
    f.repository.orders.prepare(
      f.context,
      f.principal,
      { intent: checkoutIntent(), payloadHash: 'c'.repeat(64) },
      () => basketOperationId,
      currentBasketOwner,
    ),
  ).rejects.toThrow();
  expect(
    (await f.repository.orders.load(f.context, f.principal, currentBasketOwner))?.proof.operationId,
  ).toBe(basketOperationId);
  await expect(
    f.repository.orders.prepare(
      f.context,
      f.principal,
      { intent: checkoutIntent(), payloadHash: 'c'.repeat(64) },
      () => tenantB,
      currentBasketOwner,
    ),
  ).rejects.toThrow('pending order');
});
it('withdrawn owners and restaurant contexts cannot save or restore private journal data', async () => {
  const f = await checkoutQuoteFixture();
  await expect(
    f.repository.orders.prepare(
      f.context,
      f.principal,
      { intent: checkoutIntent(), payloadHash: 'c'.repeat(64) },
      () => basketOperationId,
      () => {
        throw new Error('Owner changed');
      },
    ),
  ).rejects.toThrow('Owner changed');
  f.boundary.select(tenantB);
  await expect(
    f.repository.orders.load(f.context, f.principal, currentBasketOwner),
  ).rejects.toThrow();
});
