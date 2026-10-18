import { z } from 'zod';
import { CustomerTransport, type Fetch } from './transport';
import { CredentialVault } from './credentials';
import { TenantBoundary } from './tenantContext';
import { fixtureDirectory, memorySecrets, tenantA } from '../test/fixtures';
import { setup, response } from '../test/transport';
it('refuses private requests without the correct explicit principal before dispatch', async () => {
  const { client, context, fetcher } = setup();
  for (const credentials of ['customer', 'guest', 'table'] as const) {
    await expect(
      client.request(context, '/api/Basket', z.string(), { credentials }),
    ).rejects.toMatchObject({ status: 401 });
  }
  await expect(
    client.request(context, '/api/Basket', z.string(), {
      credentials: 'customer',
      principal: { kind: 'guest', id: 'a' },
    }),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    client.request(context, '/api/Basket', z.string(), {
      credentials: 'table',
      principal: { kind: 'customer', id: 'a' },
    }),
  ).rejects.toMatchObject({ status: 401 });
  expect(fetcher).not.toHaveBeenCalled();
});

it('captures one immutable guest identity across asynchronous capability reads', async () => {
  const boundary = new TenantBoundary(fixtureDirectory());
  const context = boundary.select(tenantA);
  const memory = memorySecrets();
  let release: () => void = () => {
    throw new Error('Gate unavailable');
  };
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const vault = new CredentialVault({
    ...memory,
    get: async (key) => {
      if (key.endsWith('.guest-session')) await gate;
      return memory.get(key);
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
  const fetcher = jest
    .fn<ReturnType<Fetch>, Parameters<Fetch>>()
    .mockResolvedValue(response({ success: true, data: 'ok' }));
  const client = new CustomerTransport(boundary, vault, fetcher);
  const principal = { kind: 'guest' as const, id: 'a' };
  const request = client.request(context, '/api/table-guest-visits/current', z.string(), {
    credentials: 'table',
    principal,
  });
  principal.id = 'b';
  release();
  await request;
  expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
    'X-Session-Id': 'session-a',
    'X-Table-Participant': 'participant-a',
  });
});
