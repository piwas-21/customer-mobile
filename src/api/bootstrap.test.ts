import { z } from 'zod';
import { readBootstrap } from './bootstrap';
import { CustomerTransport } from '../core/transport';
import { CredentialVault } from '../core/credentials';
import { TenantBoundary } from '../core/tenantContext';
import { fixtureDirectory, memorySecrets, tenantA, tenantB } from '../test/fixtures';
it('rejects a bootstrap naming a different immutable tenant even from the approved endpoint', async () => {
  const boundary = new TenantBoundary(fixtureDirectory());
  const context = boundary.select(tenantA);
  const client = new CustomerTransport(boundary, new CredentialVault(memorySecrets()));
  jest.spyOn(client, 'request').mockImplementation(async (_context, _path, schema: z.ZodType) =>
    schema.parse({
      schemaVersion: 1,
      tenantId: tenantB,
      currency: 'EUR',
      locale: 'fr',
      timezone: 'Europe/Paris',
      lifecycle: 'active',
      compatibility: 'supported',
      modules: [],
      flags: {},
      capabilities: { menu: 'enabled' },
    }),
  );
  await expect(readBootstrap(client, context)).rejects.toMatchObject({ reason: 'contract' });
});
