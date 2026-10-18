import { SessionRepository } from './sessionRepository';
import { secretKey, type CustomerSession } from './credentials';
import { TenantBoundary } from './tenantContext';
import { fixtureDirectory, memorySecrets, tenantA, tenantB } from '../test/fixtures';
const session = { userId: tenantA, accessToken: 'access-one', refreshToken: 'refresh-one' };
const pointer = (environment: string, tenant: string) =>
  `v2.${environment}.${tenant}.active-customer`;
function sessionSetup() {
  const store = memorySecrets();
  const boundary = new TenantBoundary(fixtureDirectory());
  const context = boundary.select(tenantA);
  const repository = new SessionRepository(store);
  return { store, boundary, context, repository };
}
it('restores a selected session from private storage with environment/tenant isolation', async () => {
  const { repository, context, boundary } = sessionSetup();
  expect(await repository.load(context)).toBeNull();
  await repository.activate(context, session, () => true);
  expect(await repository.load(context)).toEqual(session);
  expect(await repository.load({ ...context, environment: 'production' })).toBeNull();
  expect(await repository.load(boundary.select(tenantB))).toBeNull();
});
it('rejects a corrupt pointer and invalid principal without persisting credentials', async () => {
  const { repository, context, store } = sessionSetup();
  store.values.set(pointer('staging', tenantA), 'corrupt');
  await expect(repository.load(context)).rejects.toThrow();
  store.values.clear();
  await expect(
    repository.activate(context, { ...session, userId: 'invalid' }, () => true),
  ).rejects.toThrow();
  expect(store.values.size).toBe(0);
});
it('does not activate after cancellation or a tenant switch', async () => {
  const { repository, context, boundary, store } = sessionSetup();
  await expect(repository.activate(context, session, () => false)).rejects.toThrow();
  boundary.select(tenantB);
  await expect(repository.activate(context, session, () => true)).rejects.toThrow();
  expect(store.values.size).toBe(0);
});
it.each(['credential', 'pointer'])(
  'rolls back a stale operation while writing the %s',
  async (stage) => {
    const store = memorySecrets();
    const context = new TenantBoundary(fixtureDirectory()).select(tenantA);
    let valid = true;
    let arm = false;
    const repository = new SessionRepository({
      ...store,
      set: async (key, value) => {
        await store.set(key, value);
        if (
          arm &&
          (stage === 'pointer' ? key.endsWith('.active-customer') : key.endsWith('.session'))
        ) {
          valid = false;
          arm = false;
        }
      },
    });
    await repository.activate(context, session, () => true);
    arm = true;
    await expect(
      repository.activate(context, { ...session, accessToken: 'new-access' }, () => valid),
    ).rejects.toThrow();
    expect(await repository.load(context)).toEqual(session);
  },
);
it('rolls back a first login if selection storage fails and can retry after the failure', async () => {
  const store = memorySecrets();
  const context = new TenantBoundary(fixtureDirectory()).select(tenantA);
  let fail = true;
  const repository = new SessionRepository({
    ...store,
    set: (key, value) => {
      if (fail && key.endsWith('.active-customer'))
        return Promise.reject(new Error('Storage refused'));
      return store.set(key, value);
    },
  });
  await expect(repository.activate(context, session, () => true)).rejects.toThrow(
    'Storage refused',
  );
  expect(store.values.size).toBe(0);
  fail = false;
  await repository.activate(context, session, () => true);
  expect(await repository.load(context)).toEqual(session);
});
it('clears only the expected session, preserving a newer sign-in and another customer', async () => {
  const { repository, context } = sessionSetup();
  await repository.activate(context, session, () => true);
  const newer = { ...session, accessToken: 'new-access', refreshToken: 'new-refresh' };
  await repository.activate(context, newer, () => true);
  expect(await repository.clear(context, session)).toBe(false);
  expect(await repository.load(context)).toEqual(newer);
  const other = { ...session, userId: tenantB };
  await repository.activate(context, other, () => true);
  expect(await repository.clear(context, newer)).toBe(true);
  expect(await repository.load(context)).toEqual(other);
  expect(await repository.clear(context, other)).toBe(true);
  expect(await repository.load(context)).toBeNull();
});
it('withdraws selection before reporting incomplete credential removal', async () => {
  const store = memorySecrets();
  const context = new TenantBoundary(fixtureDirectory()).select(tenantA);
  let fail = false;
  const repository = new SessionRepository({
    ...store,
    remove: (key) =>
      fail && key.endsWith('.session')
        ? Promise.reject(new Error('Storage refused'))
        : store.remove(key),
  });
  await repository.activate(context, session, () => true);
  fail = true;
  await expect(repository.clear(context, session)).rejects.toThrow('Credential removal incomplete');
  await expect(repository.load(context)).rejects.toThrow('Credential removal incomplete');
  expect(store.values.has(secretKey(context, 'session', { kind: 'customer', id: tenantA }))).toBe(
    true,
  );
});
it('captures the caller session before queued storage work', async () => {
  const { repository, context } = sessionSetup();
  const mutable: CustomerSession = { ...session };
  const pending = repository.activate(context, mutable, () => true);
  mutable.userId = tenantB;
  mutable.accessToken = 'other';
  await pending;
  expect(await repository.load(context)).toEqual(session);
});
it('attempts credential deletion even when selection removal fails', async () => {
  const store = memorySecrets();
  const context = new TenantBoundary(fixtureDirectory()).select(tenantA);
  let fail = false;
  const repository = new SessionRepository({
    ...store,
    remove: (key) =>
      fail && key.endsWith('.active-customer')
        ? Promise.reject(new Error('Selection refused'))
        : store.remove(key),
  });
  await repository.activate(context, session, () => true);
  fail = true;
  await expect(repository.clear(context, session)).rejects.toThrow('Selection refused');
  expect(store.values.has(secretKey(context, 'session', { kind: 'customer', id: tenantA }))).toBe(
    false,
  );
  await expect(repository.load(context)).rejects.toThrow('Selection refused');
  fail = false;
  expect(await repository.load(context)).toBeNull();
  expect(store.values.size).toBe(0);
});
