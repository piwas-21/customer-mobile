import { CredentialVault, secretKey } from './credentials';
import { TenantBoundary } from './tenantContext';
import { fixtureDirectory, memorySecrets, tenantA, tenantB } from '../test/fixtures';
it('stores customer and participant capabilities only in the scoped secret adapter', async () => {
  const boundary = new TenantBoundary(fixtureDirectory());
  const a = boundary.select(tenantA);
  const b = boundary.select(tenantB);
  const store = memorySecrets();
  const vault = new CredentialVault(store);
  expect(await vault.session(a)).toBeNull();
  await vault.saveSession(a, {
    userId: 'customer',
    accessToken: 'access-a',
    refreshToken: 'refresh-a',
  });
  await vault.saveCapability(a, 'table-participant', 'participant-a');
  expect(await vault.session(b)).toBeNull();
  expect(await vault.capability(b, 'table-participant')).toBeNull();
  expect((await vault.session(a))?.accessToken).toBe('access-a');
  await expect(vault.saveCapability(a, 'guest-session', '\r\n')).rejects.toThrow();
  await vault.saveCapability(b, 'guest-session', 'guest-b');
  await vault.clear(a);
  expect(await vault.session(a)).toBeNull();
  expect(await vault.capability(a, 'table-participant')).toBeNull();
  expect(store.values.get(secretKey(b, 'guest-session'))).toBe('guest-b');
});
