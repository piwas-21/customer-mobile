import { SessionRepository } from './sessionRepository';
import { secretKey } from './credentials';
import { basketOperationRecordSchema } from './basketOperationRecord';
import { basketMutation, existingBasketSession } from '../test/basketMutations';
import {
  basketOperationsFixture,
  basketPrincipal,
  basketInput,
  basketOperationId,
  basketSessionId,
  currentBasketOwner,
} from '../test/basketOperations';
it('persists a versioned immutable edit before submission and restores the exact request after restart', async () => {
  const f = basketOperationsFixture();
  await existingBasketSession(f);
  const request = basketMutation();
  const pending = await f.repository.baskets.prepareRequest(
    f.context,
    basketPrincipal,
    { schemaVersion: 2, request },
    f.createId,
    currentBasketOwner,
    'create-only',
  );
  expect(pending).toMatchObject({
    schemaVersion: 2,
    operationId: basketOperationId,
    sessionId: basketSessionId,
    phase: 'ready',
    request,
  });
  expect(() => Object.assign(pending.request, { quantity: 99 })).toThrow(TypeError);
  const restored = await new SessionRepository(f.store).baskets.load(
    f.context,
    basketPrincipal,
    currentBasketOwner,
  );
  expect(restored).toEqual(pending);
  await f.repository.baskets.finish(
    f.context,
    basketPrincipal,
    basketOperationId,
    currentBasketOwner,
  );
  expect(
    await f.repository.baskets.load(f.context, basketPrincipal, currentBasketOwner),
  ).toBeNull();
});
it('refuses an edit without an existing reviewed session and consumes no new identity', async () => {
  const f = basketOperationsFixture();
  const ids = jest.fn(f.createId);
  await expect(
    f.repository.baskets.prepareRequest(
      f.context,
      basketPrincipal,
      { schemaVersion: 2, request: basketMutation() },
      ids,
      currentBasketOwner,
    ),
  ).rejects.toThrow('reviewed basket session');
  expect(ids).not.toHaveBeenCalled();
  expect(
    await f.repository.baskets.load(f.context, basketPrincipal, currentBasketOwner),
  ).toBeNull();
});
it('restores the accepted old add format and refuses to replace it with a new edit', async () => {
  const f = basketOperationsFixture();
  await existingBasketSession(f);
  const add = {
    schemaVersion: 1,
    environment: f.context.environment,
    tenantId: f.context.tenant.id,
    principal: basketPrincipal,
    sessionId: basketSessionId,
    operationId: basketOperationId,
    phase: 'ready',
    request: basketInput,
  };
  const key = secretKey(f.context, 'basket-operation', basketPrincipal);
  const wire = JSON.stringify(add);
  await f.store.set(key, wire);
  const restarted = new SessionRepository(f.store);
  expect(await restarted.baskets.load(f.context, basketPrincipal, currentBasketOwner)).toEqual(add);
  await expect(
    restarted.baskets.prepareRequest(
      f.context,
      basketPrincipal,
      { schemaVersion: 2, request: basketMutation() },
      f.createId,
      currentBasketOwner,
    ),
  ).rejects.toThrow('Recover');
  expect(await f.store.get(key)).toBe(wire);
});
it('rejects future/mismatched formats and refuses to install a new session for an edit record', async () => {
  const f = basketOperationsFixture();
  await existingBasketSession(f);
  const edit = await f.repository.baskets.prepareRequest(
    f.context,
    basketPrincipal,
    { schemaVersion: 2, request: basketMutation('Remove') },
    f.createId,
    currentBasketOwner,
  );
  for (const patch of [
    { schemaVersion: 3 },
    { schemaVersion: 1 },
    { request: basketInput },
    { phase: 'installing' },
  ])
    expect(basketOperationRecordSchema.safeParse({ ...edit, ...patch }).success).toBe(false);
  const different = { ...f.context, environment: 'production' as const };
  expect(
    await f.repository.baskets.load(different, basketPrincipal, currentBasketOwner),
  ).toBeNull();
});
it('captures edit inputs before the shared secure queue and refuses competing add/removal replacement', async () => {
  const f = basketOperationsFixture();
  await existingBasketSession(f);
  const input = basketMutation();
  const original = { ...input };
  const preparing = f.repository.baskets.prepareRequest(
    f.context,
    basketPrincipal,
    { schemaVersion: 2, request: input },
    f.createId,
    currentBasketOwner,
  );
  Object.assign(input, { quantity: 99, expectedBasketId: basketSessionId });
  const pending = await preparing;
  expect(pending.request).toEqual(original);
  await expect(
    f.repository.baskets.prepare(
      f.context,
      basketPrincipal,
      basketInput,
      f.createId,
      currentBasketOwner,
    ),
  ).rejects.toThrow('Recover');
  await expect(
    f.repository.baskets.prepareRequest(
      f.context,
      basketPrincipal,
      { schemaVersion: 2, request: basketMutation('Remove') },
      f.createId,
      currentBasketOwner,
    ),
  ).rejects.toThrow('Recover');
  expect(await f.repository.baskets.load(f.context, basketPrincipal, currentBasketOwner)).toEqual(
    pending,
  );
});
