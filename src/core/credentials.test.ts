import { CredentialVault, secretKey, type Principal } from './credentials';
import { TenantBoundary } from './tenantContext';
import { fixtureDirectory, memorySecrets, tenantA, tenantB } from '../test/fixtures';
const guest: Principal = { kind: 'guest', id: 'installation-a' };
it('stores customer and participant capabilities only in the scoped secret adapter', async () => {
  const boundary = new TenantBoundary(fixtureDirectory());
  const a = boundary.select(tenantA);
  const b = boundary.select(tenantB);
  const store = memorySecrets();
  const vault = new CredentialVault(store);
  expect(await vault.session(a, 'customer')).toBeNull();
  await vault.saveSession(a, {
    userId: 'customer',
    accessToken: 'access-a',
    refreshToken: 'refresh-a',
  });
  await vault.saveCapability(a, 'table-participant', guest, 'participant-a');
  expect(await vault.session(b, 'customer')).toBeNull();
  expect(await vault.capability(b, 'table-participant', guest)).toBeNull();
  expect((await vault.session(a, 'customer'))?.accessToken).toBe('access-a');
  await expect(vault.saveCapability(a, 'guest-session', guest, '\r\n')).rejects.toThrow();
  await vault.saveCapability(b, 'guest-session', guest, 'guest-b');
  await vault.clear(a, guest);
  await vault.clear(a, { kind: 'customer', id: 'customer' });
  expect(await vault.session(a, 'customer')).toBeNull();
  expect(await vault.capability(a, 'table-participant', guest)).toBeNull();
  expect(store.values.get(secretKey(b, 'guest-session', guest))).toBe('guest-b');
});

it('isolates two customers and two guest identities within one restaurant, including targeted logout', async () => {
  const context = new TenantBoundary(fixtureDirectory()).select(tenantA);
  const vault = new CredentialVault(memorySecrets());
  for (const id of ['a', 'b']) {
    await vault.saveSession(context, {
      userId: id,
      accessToken: `access-${id}`,
      refreshToken: `refresh-${id}`,
    });
    await vault.saveCapability(
      context,
      'table-participant',
      { kind: 'guest', id },
      `participant-${id}`,
    );
  }
  await vault.clear(context, { kind: 'customer', id: 'a' });
  await vault.clear(context, { kind: 'guest', id: 'a' });
  expect(await vault.session(context, 'a')).toBeNull();
  expect((await vault.session(context, 'b'))?.accessToken).toBe('access-b');
  expect(
    await vault.capability(context, 'table-participant', { kind: 'guest', id: 'a' }),
  ).toBeNull();
  expect(await vault.capability(context, 'table-participant', { kind: 'guest', id: 'b' })).toBe(
    'participant-b',
  );
});
it('rejects corrupt persisted capabilities, sessions and mismatched identities before use', async () => {
  const context = new TenantBoundary(fixtureDirectory()).select(tenantA);
  const store = memorySecrets();
  const vault = new CredentialVault(store);
  for (const value of ['', ' leading-space', 'control\r\nheader', '\0', 'x'.repeat(16001)]) {
    store.values.set(secretKey(context, 'table-participant', guest), value);
    await expect(vault.capability(context, 'table-participant', guest)).rejects.toThrow();
    await expect(vault.saveCapability(context, 'guest-session', guest, value)).rejects.toThrow();
  }
  for (const value of [
    'not-json',
    '{}',
    JSON.stringify({ userId: 'other', accessToken: 'access', refreshToken: 'refresh' }),
    JSON.stringify({ userId: 'a', accessToken: 'bad\r\nheader', refreshToken: 'refresh' }),
  ]) {
    store.values.set(secretKey(context, 'session', { kind: 'customer', id: 'a' }), value);
    await expect(vault.session(context, 'a')).rejects.toThrow();
  }
  expect(() => secretKey(context, 'payment', { kind: 'guest', id: '../other' })).toThrow();
});

it('targeted logout captures its principal across asynchronous removals', async () => {
  const context = new TenantBoundary(fixtureDirectory()).select(tenantA);
  const memory = memorySecrets();
  let release: () => void = () => {
    throw new Error('Gate unavailable');
  };
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let removals = 0;
  const vault = new CredentialVault({
    ...memory,
    remove: async (key) => {
      if (++removals === 1) await gate;
      await memory.remove(key);
    },
  });
  for (const id of ['a', 'b']) {
    await vault.saveCapability(context, 'guest-session', { kind: 'guest', id }, `session-${id}`);
    await vault.saveCapability(
      context,
      'table-participant',
      { kind: 'guest', id },
      `participant-${id}`,
    );
  }
  const principal = { kind: 'guest' as const, id: 'a' };
  const clearing = vault.clear(context, principal);
  principal.id = 'b';
  release();
  await clearing;
  expect(await vault.capability(context, 'guest-session', { kind: 'guest', id: 'a' })).toBeNull();
  expect(
    await vault.capability(context, 'table-participant', { kind: 'guest', id: 'a' }),
  ).toBeNull();
  expect(await vault.capability(context, 'guest-session', { kind: 'guest', id: 'b' })).toBe(
    'session-b',
  );
  expect(await vault.capability(context, 'table-participant', { kind: 'guest', id: 'b' })).toBe(
    'participant-b',
  );
});
