import { SessionRepository } from './sessionRepository';
import { secretKey } from './credentials';
import { tenantA, tenantB } from '../test/fixtures';
import {
  basketPrincipal as principal,
  basketInput as input,
  basketSessionId as sessionId,
  basketOperationId as operationId,
  currentBasketOwner as current,
  basketOperationsFixture as fixture,
} from '../test/basketOperations';

test('a failed write cannot authorize dispatch, while a write that actually persisted recovers the same operation', async () => {
  let fail = true;
  const { context, repository, createId } = fixture((store) => ({
    ...store,
    set: async (key, value) => {
      await store.set(key, value);
      if (key.endsWith('.basket-operation') && fail) {
        fail = false;
        throw new Error('storage acknowledgement lost');
      }
    },
  }));
  await expect(
    repository.baskets.prepare(context, principal, input, createId, current),
  ).rejects.toThrow('acknowledgement');
  const recovered = await repository.baskets.load(context, principal, current);
  expect(recovered?.operationId).toBe(operationId);
  await expect(
    repository.baskets.prepare(
      context,
      principal,
      input,
      () => {
        throw new Error('Must not replace identity');
      },
      current,
    ),
  ).resolves.toEqual(recovered);
});

test('truncated operation storage fails readback and cannot be silently overwritten', async () => {
  const { context, repository, createId } = fixture((store) => ({
    ...store,
    set: (key, value) => store.set(key, key.endsWith('.basket-operation') ? '{truncated' : value),
  }));
  await expect(
    repository.baskets.prepare(context, principal, input, createId, current),
  ).rejects.toThrow('save incomplete');
  await expect(repository.baskets.load(context, principal, current)).rejects.toThrow();
  await expect(
    repository.baskets.prepare(context, principal, input, createId, current),
  ).rejects.toThrow();
});

test('session storage must also read back exactly before an operation is persisted', async () => {
  const { context, store, repository, createId } = fixture((memory) => ({
    ...memory,
    set: (key, value) => memory.set(key, key.endsWith('.guest-session') ? tenantB : value),
  }));
  await expect(
    repository.baskets.prepare(context, principal, input, createId, current),
  ).rejects.toThrow('session save incomplete');
  const key = secretKey(context, 'basket-operation', principal);
  expect(JSON.parse(store.values.get(key)!).phase).toBe('installing');
  await expect(
    repository.baskets.prepare(
      context,
      principal,
      input,
      () => {
        throw new Error('No replacement UUID');
      },
      current,
    ),
  ).rejects.toThrow('scope');
  const restarted = new SessionRepository(store);
  await expect(restarted.baskets.load(context, principal, current)).rejects.toThrow('scope');
});

test('stale owner guards and invalid generated identities cannot prepare a write', async () => {
  const { context, store, repository, createId } = fixture((memory) => memory);
  await expect(
    repository.baskets.prepare(context, principal, input, createId, () => {
      throw new Error('Owner changed');
    }),
  ).rejects.toThrow('Owner changed');
  expect(store.values.size).toBe(0);
  await expect(
    repository.baskets.prepare(context, principal, input, () => 'invalid', current),
  ).rejects.toThrow();
  expect(store.values.size).toBe(0);
  await repository.vault.saveCapability(context, 'guest-session', principal, 'legacy-session');
  await expect(
    repository.baskets.prepare(context, principal, input, createId, current),
  ).rejects.toThrow();
  expect(store.values.has(secretKey(context, 'basket-operation', principal))).toBe(false);
});

test('failed completion retains the original operation until cleanup succeeds', async () => {
  let fail = true;
  const { context, repository, createId } = fixture((store) => ({
    ...store,
    remove: async (key) => {
      if (key.endsWith('.basket-operation') && fail) {
        fail = false;
        throw new Error('cleanup unavailable');
      }
      await store.remove(key);
    },
  }));
  await repository.baskets.prepare(context, principal, input, createId, current);
  await expect(repository.baskets.finish(context, principal, operationId, current)).rejects.toThrow(
    'cleanup',
  );
  expect((await repository.baskets.load(context, principal, current))?.operationId).toBe(
    operationId,
  );
  await repository.baskets.finish(context, principal, operationId, current);
  await expect(repository.baskets.load(context, principal, current)).resolves.toBeNull();
});

test('logout and pending-operation storage share one queue, so a late save cannot outlive cleanup', async () => {
  let entered = () => {};
  let release = () => {};
  const writing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { context, store, repository, createId } = fixture((memory) => ({
    ...memory,
    set: async (key, value) => {
      if (key.endsWith('.basket-operation')) {
        entered();
        await gate;
      }
      await memory.set(key, value);
    },
  }));
  const customer = { kind: 'customer', id: tenantA } as const;
  const session = { userId: tenantA, accessToken: 'access', refreshToken: 'refresh' };
  await repository.activate(context, session, () => true);
  let active = true;
  const preparing = repository.baskets.prepare(context, customer, input, createId, () => {
    if (!active) throw new Error('Logged out');
  });
  await writing;
  active = false;
  const refusal = expect(preparing).rejects.toThrow('Logged out');
  const clearing = repository.clear(context, session);
  release();
  await refusal;
  await expect(clearing).resolves.toBe(true);
  expect(store.values.has(secretKey(context, 'basket-operation', customer))).toBe(false);
  await expect(repository.vault.capability(context, 'guest-session', customer)).resolves.toBeNull();
  await expect(repository.baskets.load(context, customer, current)).resolves.toBeNull();
});

test('completion cannot report success when secure removal silently retains the record', async () => {
  const { context, repository, createId } = fixture((store) => ({
    ...store,
    remove: async () => {},
  }));
  await repository.baskets.prepare(context, principal, input, createId, current);
  await expect(repository.baskets.finish(context, principal, operationId, current)).rejects.toThrow(
    'removal incomplete',
  );
  expect((await repository.baskets.load(context, principal, current))?.operationId).toBe(
    operationId,
  );
});

test('lost session-save acknowledgement resumes the intended UUID and operation after restart', async () => {
  let fail = true;
  const { context, store, repository, createId } = fixture((memory) => ({
    ...memory,
    set: async (key, value) => {
      await memory.set(key, value);
      if (key.endsWith('.guest-session') && fail) {
        fail = false;
        throw new Error('Session acknowledgement lost');
      }
    },
  }));
  await expect(
    repository.baskets.prepare(context, principal, input, createId, current),
  ).rejects.toThrow('acknowledgement');
  const key = secretKey(context, 'basket-operation', principal);
  expect(JSON.parse(store.values.get(key)!).phase).toBe('installing');
  const restarted = new SessionRepository(store);
  const recovered = await restarted.baskets.load(context, principal, current);
  expect(recovered).toMatchObject({ phase: 'ready', operationId, sessionId, request: input });
  expect(JSON.parse(store.values.get(key)!).phase).toBe('ready');
});
