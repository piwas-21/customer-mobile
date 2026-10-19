import { z } from 'zod';
import { CredentialVault, type Principal } from './credentials';
import { CustomerTransport, type Fetch } from './transport';
import { TenantBoundary } from './tenantContext';
import { fixtureDirectory, memorySecrets, tenantA, tenantB } from '../test/fixtures';
import { response } from '../test/transport';

const customer = { kind: 'customer', id: tenantA } as const;
const guest = { kind: 'guest', id: tenantA } as const;
const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function setup() {
  const boundary = new TenantBoundary(fixtureDirectory());
  const context = boundary.select(tenantA);
  const secrets = memorySecrets();
  const vault = new CredentialVault(secrets);
  const fetcher = jest
    .fn<ReturnType<Fetch>, Parameters<Fetch>>()
    .mockResolvedValue(response({ success: true, data: 'ok' }));
  const client = new CustomerTransport(boundary, vault, fetcher);
  return { boundary, context, secrets, vault, fetcher, client };
}

test('customer basket credentials combine only that principal session and access token', async () => {
  const { context, client, vault, fetcher } = setup();
  await vault.saveSession(context, {
    userId: customer.id,
    accessToken: 'customer-token',
    refreshToken: 'refresh',
  });
  await vault.saveCapability(context, 'guest-session', customer, sessionId);
  await vault.saveCapability(context, 'guest-session', guest, tenantB);
  await client.request(context, '/api/Basket', z.string(), {
    credentials: 'basket',
    principal: customer,
  });
  expect(fetcher.mock.calls[0]?.[1].headers).toMatchObject({
    Authorization: 'Bearer customer-token',
    'X-Session-Id': sessionId,
  });
  expect(fetcher.mock.calls[0]?.[1].headers).not.toHaveProperty('X-Table-Participant');
});

test('guest basket credentials never borrow a stored customer token', async () => {
  const { context, client, vault, fetcher } = setup();
  await vault.saveSession(context, {
    userId: customer.id,
    accessToken: 'customer-token',
    refreshToken: 'refresh',
  });
  await vault.saveCapability(context, 'guest-session', guest, sessionId);
  await client.request(context, '/api/Basket', z.string(), {
    credentials: 'basket',
    principal: guest,
  });
  expect(fetcher.mock.calls[0]?.[1].headers?.['X-Session-Id']).toBe(sessionId);
  expect(fetcher.mock.calls[0]?.[1].headers).not.toHaveProperty('Authorization');
});

test.each([undefined, guest, customer])(
  'refuses missing scoped basket credentials: %p',
  async (principal) => {
    const { context, client, fetcher } = setup();
    await expect(
      client.request(context, '/api/Basket', z.string(), {
        credentials: 'basket',
        ...(principal ? { principal } : {}),
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
  },
);

test('a customer token alone cannot silently fall back to a guest basket', async () => {
  const { context, client, vault, fetcher } = setup();
  await vault.saveSession(context, {
    userId: customer.id,
    accessToken: 'token',
    refreshToken: 'refresh',
  });
  await vault.saveCapability(context, 'guest-session', guest, sessionId);
  await expect(
    client.request(context, '/api/Basket', z.string(), {
      credentials: 'basket',
      principal: customer,
    }),
  ).rejects.toMatchObject({ status: 401 });
  expect(fetcher).not.toHaveBeenCalled();
});

test.each([
  'session-text',
  'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
  '00000000-0000-0000-0000-000000000000',
])('rejects noncanonical basket session %s before dispatch', async (session) => {
  const { context, client, vault, fetcher } = setup();
  await vault.saveCapability(context, 'guest-session', guest, session);
  await expect(
    client.request(context, '/api/Basket', z.string(), { credentials: 'basket', principal: guest }),
  ).rejects.toMatchObject({ status: 401 });
  expect(fetcher).not.toHaveBeenCalled();
});

test('basket capabilities do not cross restaurant or environment scopes', async () => {
  const { boundary, context, client, vault, fetcher } = setup();
  await vault.saveCapability(context, 'guest-session', guest, sessionId);
  const second = boundary.select(tenantB);
  await expect(
    client.request(second, '/api/Basket', z.string(), { credentials: 'basket', principal: guest }),
  ).rejects.toMatchObject({ status: 401 });
  const production = { ...second, environment: 'production' as const };
  await expect(vault.capability(production, 'guest-session', guest)).resolves.toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

test('captures the original principal and wire body before a credential read yields', async () => {
  const { boundary, context, vault, secrets, fetcher } = setup();
  await vault.saveCapability(context, 'guest-session', guest, sessionId);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const delayed = new CredentialVault({
    ...secrets,
    get: async (key) => {
      await gate;
      return secrets.get(key);
    },
  });
  const client = new CustomerTransport(boundary, delayed, fetcher);
  const principal: { kind: Principal['kind']; id: string } = { ...guest };
  const body = { quantity: 1 };
  const pending = client.request(context, '/api/Basket/items', z.string(), {
    method: 'POST',
    credentials: 'basket',
    principal,
    body,
  });
  principal.id = tenantB;
  body.quantity = 99;
  release();
  await pending;
  expect(fetcher.mock.calls[0]?.[1].body).toBe('{"quantity":1}');
  expect(fetcher.mock.calls[0]?.[1].headers?.['X-Session-Id']).toBe(sessionId);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test.each([401, 429, 500])(
  'does not automatically retry a basket write after HTTP %i',
  async (status) => {
    const { context, client, vault, fetcher } = setup();
    await vault.saveCapability(context, 'guest-session', guest, sessionId);
    fetcher.mockResolvedValue(response({ success: false }, status));
    await expect(
      client.request(context, '/api/Basket/items', z.string(), {
        method: 'POST',
        credentials: 'basket',
        principal: guest,
        body: { quantity: 1 },
      }),
    ).rejects.toMatchObject({ status });
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

test('withdraws a request when restaurant selection changes during a secure read', async () => {
  const { context, client, boundary, vault, fetcher } = setup();
  let release = () => {};
  jest.spyOn(vault, 'capability').mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        release = () => resolve(sessionId);
      }),
  );
  const pending = client.request(context, '/api/Basket', z.string(), {
    credentials: 'basket',
    principal: guest,
  });
  boundary.select(tenantB);
  release();
  await expect(pending).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
