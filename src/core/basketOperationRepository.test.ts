import { SessionRepository } from './sessionRepository';
import { secretKey } from './credentials';
import { tenantA, tenantB } from '../test/fixtures';
import {
  basketPrincipal as principal,
  basketInput as input,
  basketSessionId as sessionId,
  basketOperationId as operationId,
  currentBasketOwner as current,
  basketOperationsFixture as setup,
} from '../test/basketOperations';

test('persists the exact scoped operation and restores it after repository restart', async () => {
  const { context, store, repository, createId } = setup();
  const pending = await repository.baskets.prepare(context, principal, input, createId, current);
  expect(pending).toEqual({
    schemaVersion: 1,
    phase: 'ready',
    environment: 'staging',
    tenantId: tenantA,
    principal,
    sessionId,
    operationId,
    request: input,
  });
  const restarted = new SessionRepository(store);
  await expect(restarted.baskets.load(context, principal, current)).resolves.toEqual(pending);
  expect(store.values.get(secretKey(context, 'basket-operation', principal))).toBe(
    JSON.stringify(pending),
  );
});

test('a retry retains its identity; concurrent duplicate preparation cannot mint another operation', async () => {
  const { context, repository, createId } = setup();
  const [first, second] = await Promise.all([
    repository.baskets.prepare(context, principal, input, createId, current),
    repository.baskets.prepare(context, principal, input, createId, current),
  ]);
  expect(first).toEqual(second);
  expect(first.operationId).toBe(operationId);
  await expect(
    repository.baskets.prepare(context, principal, { ...input, quantity: 3 }, createId, current),
  ).rejects.toThrow('Recover');
});

test('captures nested input and principal before waiting for the secure write queue', async () => {
  const { context, repository, createId } = setup();
  const owner: { kind: 'guest'; id: string } = { ...principal };
  const request = { ...input, ingredientQuantities: { [tenantB]: 1 } };
  const pending = repository.baskets.prepare(context, owner, request, createId, current);
  owner.id = 'other';
  request.ingredientQuantities[tenantB] = 99;
  const result = await pending;
  if (result.schemaVersion !== 1) throw new Error('Expected the saved add format');
  expect(result.principal.id).toBe('basket');
  expect(result.request.ingredientQuantities).toEqual({ [tenantB]: 1 });
});

test('tenant, environment and principal records remain isolated', async () => {
  const { boundary, context, repository, createId } = setup();
  await repository.baskets.prepare(context, principal, input, createId, current);
  await expect(
    repository.baskets.load(context, { kind: 'customer', id: principal.id }, current),
  ).resolves.toBeNull();
  await expect(
    repository.baskets.load({ ...context, environment: 'production' }, principal, current),
  ).resolves.toBeNull();
  await expect(
    repository.baskets.load(boundary.select(tenantB), principal, current),
  ).resolves.toBeNull();
  await expect(repository.baskets.load(context, principal, current)).rejects.toThrow('context');
});

test('completion requires the exact operation and cannot erase a newer pending add', async () => {
  const { context, repository, createId } = setup();
  await repository.baskets.prepare(context, principal, input, createId, current);
  await expect(repository.baskets.finish(context, principal, tenantB, current)).rejects.toThrow(
    'changed',
  );
  await repository.baskets.finish(context, principal, operationId, current);
  await expect(repository.baskets.load(context, principal, current)).resolves.toBeNull();
  await repository.baskets.finish(context, principal, operationId, current);
  const next = await repository.baskets.prepare(context, principal, input, createId, current);
  expect(next.operationId).toBe(tenantB);
  await expect(repository.baskets.finish(context, principal, operationId, current)).rejects.toThrow(
    'changed',
  );
  await expect(repository.baskets.load(context, principal, current)).resolves.toEqual(next);
});

test('corrupt records or changed session capabilities never silently create a fresh operation', async () => {
  const { context, store, repository, createId } = setup();
  const key = secretKey(context, 'basket-operation', principal);
  await repository.baskets.prepare(context, principal, input, createId, current);
  const valid = store.values.get(key)!;
  const record = JSON.parse(valid) as Record<string, unknown>;
  for (const change of [
    { schemaVersion: 2 },
    { tenantId: tenantB },
    { environment: 'production' },
    { principal: { kind: 'guest', id: 'other' } },
  ]) {
    await store.set(key, JSON.stringify({ ...record, ...change }));
    await expect(
      repository.baskets.prepare(context, principal, input, createId, current),
    ).rejects.toThrow();
  }
  await store.set(key, valid);
  await repository.vault.saveCapability(context, 'guest-session', principal, tenantB);
  await expect(repository.baskets.load(context, principal, current)).rejects.toThrow('scope');
  await store.set(key, '{broken');
  await expect(
    repository.baskets.prepare(context, principal, input, createId, current),
  ).rejects.toThrow();
});

test('prepared and restored records deeply freeze every nested request and owner value', async () => {
  const { context, store, repository, createId } = setup();
  const request = {
    ...input,
    selectedIngredients: [tenantB],
    ingredientQuantities: { [tenantB]: 1 },
    customizationSelections: [
      {
        groupId: tenantA,
        options: [{ kind: 'Ingredient' as const, optionId: tenantB, quantity: 1 }],
      },
    ],
  };
  const prepared = await repository.baskets.prepare(context, principal, request, createId, current);
  const restored = await new SessionRepository(store).baskets.load(context, principal, current);
  expect(restored).not.toBeNull();
  for (const record of [prepared, restored!]) {
    if (record.schemaVersion !== 1) throw new Error('Expected the saved add format');
    expect(() => Object.assign(record, { operationId: tenantB })).toThrow(TypeError);
    expect(() => Object.assign(record.principal, { id: 'other' })).toThrow(TypeError);
    expect(() => Object.assign(record.request, { quantity: 99 })).toThrow(TypeError);
    expect(() => Object.assign(record.request.selectedIngredients!, { 0: tenantA })).toThrow(
      TypeError,
    );
    expect(() => Object.assign(record.request.ingredientQuantities!, { [tenantB]: 99 })).toThrow(
      TypeError,
    );
    expect(() =>
      Object.assign(record.request.customizationSelections![0]!.options[0]!, { quantity: 99 }),
    ).toThrow(TypeError);
    expect(record.request).toEqual(request);
  }
  expect((await repository.baskets.load(context, principal, current))?.request).toEqual(request);
});
