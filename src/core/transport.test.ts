import { z } from 'zod';
import { apiUrl, fetchDirectory, type Fetch } from './transport';
import { tenantB } from '../test/fixtures';
import { setup, response } from '../test/transport';
it('captures tenant credentials and refuses tokens for another tenant', async () => {
  const { boundary, vault, fetcher, client, context } = setup();
  await vault.saveSession(context, {
    userId: 'a',
    accessToken: 'token-a',
    refreshToken: 'refresh-a',
  });
  fetcher.mockResolvedValue(response({ success: true, data: 'ok' }));
  await expect(
    client.request(context, '/api/Basket', z.string(), {
      credentials: 'customer',
      principal: { kind: 'customer', id: 'a' },
    }),
  ).resolves.toBe('ok');
  expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({
    Accept: 'application/json',
    Authorization: 'Bearer token-a',
  });
  await expect(
    client.request(boundary.select(tenantB), '/api/Basket', z.string(), {
      credentials: 'customer',
      principal: { kind: 'customer', id: 'a' },
    }),
  ).rejects.toMatchObject({ status: 401 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('rejects a late response and does not retry a write', async () => {
  const { boundary, fetcher, client, context } = setup();
  let finish: (value: Response) => void = () => {
    throw new Error('Request not started');
  };
  fetcher.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const request = client.request(context, '/api/Basket/items', z.string(), {
    method: 'POST',
    body: { quantity: 1 },
  });
  boundary.select(tenantB);
  finish(response({ success: true, data: 'late-a' }));
  await expect(request).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  response('proxy error', 503, 'text/html'),
  response('proxy page', 200, 'text/html'),
  response({ success: false, errors: ['refused'] }),
  response({ wrong: true }),
  response({ success: true, data: 3 }),
])('distinguishes HTTP, non-JSON and envelope failures', async (result) => {
  const { fetcher, client, context } = setup();
  fetcher.mockResolvedValue(result);
  await expect(client.request(context, '/api/Products', z.string())).rejects.toThrow();
});
it('requires both table capabilities, and never substitutes customer JWT', async () => {
  const { vault, fetcher, client, context } = setup();
  const options = {
    credentials: 'table',
    principal: { kind: 'guest', id: 'installation-a' },
    method: 'POST',
    body: {},
    locale: 'fr',
  } as const;
  await expect(
    client.request(context, '/api/table-guest-visits/join', z.string(), options),
  ).rejects.toThrow();
  await vault.saveCapability(
    context,
    'guest-session',
    { kind: 'guest', id: 'installation-a' },
    'session-a',
  );
  await expect(
    client.request(context, '/api/table-guest-visits/join', z.string(), options),
  ).rejects.toThrow();
  await vault.saveCapability(
    context,
    'table-participant',
    { kind: 'guest', id: 'installation-a' },
    'participant-a',
  );
  fetcher.mockResolvedValue(response({ success: true, data: 'table' }));
  await client.request(context, '/api/table-guest-visits/join', z.string(), options);
  expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Accept-Language': 'fr',
    'X-Session-Id': 'session-a',
    'X-Table-Participant': 'participant-a',
  });
});
it('rejects path traversal and untrusted directory response', async () => {
  expect(apiUrl('https://alpha.example', '/api/Products?Page=1')).toBe(
    'https://alpha.example/api/Products?Page=1',
  );
  for (const path of [
    'https://evil.example',
    '//evil.example/api/x',
    '/api/../admin',
    '/api/a#token',
    '/api/\\evil',
  ]) {
    expect(() => apiUrl('https://alpha.example', path)).toThrow();
  }
  const fetcher = jest
    .fn<ReturnType<Fetch>, Parameters<Fetch>>()
    .mockResolvedValue(response({}, 404));
  await expect(fetchDirectory('https://directory.example', fetcher)).rejects.toThrow();
  fetcher.mockResolvedValue(response({ tenants: [] }));
  await expect(fetchDirectory('https://directory.example', fetcher)).resolves.toEqual({
    tenants: [],
  });
});

it('omits ambient cookies and refuses redirected responses in both transports', async () => {
  const { fetcher, client, context } = setup();
  fetcher.mockResolvedValue(response({ success: true, data: 'ok' }));
  await client.request(context, '/api/Products', z.string());
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error', credentials: 'omit' });
  fetcher.mockResolvedValue({
    ...response({ success: true, data: 'redirected' }),
    redirected: true,
  });
  await expect(client.request(context, '/api/Products', z.string())).rejects.toMatchObject({
    reason: 'contract',
  });
  await expect(fetchDirectory('https://directory.example', fetcher)).rejects.toThrow();
  expect(fetcher.mock.calls[2]?.[1]).toMatchObject({ redirect: 'error', credentials: 'omit' });
});
