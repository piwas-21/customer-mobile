import { z } from 'zod';
import { tenantA, tenantB } from '../test/fixtures';
import { response } from '../test/transport';
import { session, renewed, authResponse, dataResponse, sessionSetup } from '../test/sessions';
it('publishes only identity changes and unsubscribes listeners', async () => {
  const { controller, fetcher, repository, context } = await sessionSetup(false);
  const changes: (string | null)[] = [];
  const unsubscribe = controller.subscribe(() => changes.push(controller.userId));
  fetcher.mockResolvedValue(authResponse());
  expect(await controller.login({ email: 'guest@example.test', password: 'password' }, 'en')).toBe(
    tenantA,
  );
  expect(await repository.load(context)).toEqual(renewed);
  unsubscribe();
  await controller.logout();
  expect(changes).toEqual([tenantA]);
  expect(controller.userId).toBeNull();
  expect(await repository.load(context)).toBeNull();
});
it('serializes concurrent expired reads around one refresh and retries each GET at most once', async () => {
  const { controller, fetcher } = await sessionSetup();
  fetcher.mockImplementation((url, options) =>
    Promise.resolve(
      url.endsWith('/refresh-token')
        ? authResponse()
        : options.headers?.Authorization === 'Bearer old-access'
          ? response({}, 401)
          : dataResponse(),
    ),
  );
  const results = await Promise.all([
    controller.get(tenantA, '/api/User/profile', z.string()),
    controller.get(tenantA, '/api/User/profile', z.string()),
  ]);
  expect(results).toEqual(['private profile', 'private profile']);
  const refreshes = fetcher.mock.calls.filter(([url]) => url.endsWith('/refresh-token'));
  expect(refreshes).toHaveLength(1);
  expect(refreshes[0]?.[1].headers).not.toHaveProperty('Authorization');
  expect(fetcher.mock.calls).toHaveLength(5);
});
it.each([429, 503])('preserves the session after transient refresh HTTP %s', async (status) => {
  const { controller, fetcher, repository, context } = await sessionSetup();
  fetcher.mockResolvedValueOnce(response({}, 401)).mockResolvedValueOnce(response({}, status));
  await expect(controller.get(tenantA, '/api/User/profile', z.string())).rejects.toMatchObject({
    status,
  });
  expect(controller.userId).toBe(tenantA);
  expect(await repository.load(context)).toEqual(session);
});
it('preserves credentials after a refresh network failure', async () => {
  const { controller, fetcher, repository, context } = await sessionSetup();
  fetcher.mockResolvedValueOnce(response({}, 401)).mockRejectedValueOnce(new Error('Offline'));
  await expect(controller.get(tenantA, '/api/User/profile', z.string())).rejects.toMatchObject({
    reason: 'network',
  });
  expect(await repository.load(context)).toEqual(session);
});
it('withdraws an invalid refresh session without attempting another profile read', async () => {
  const { controller, fetcher, repository, context } = await sessionSetup();
  fetcher.mockResolvedValueOnce(response({}, 401)).mockResolvedValueOnce(response({}, 401));
  await expect(controller.get(tenantA, '/api/User/profile', z.string())).rejects.toMatchObject({
    status: 401,
  });
  expect(controller.userId).toBeNull();
  expect(await repository.load(context)).toBeNull();
  expect(fetcher.mock.calls).toHaveLength(2);
});
it('does not retry permission failures or expose a different principal', async () => {
  const { controller, fetcher } = await sessionSetup();
  await expect(controller.get(tenantB, '/api/User/profile', z.string())).rejects.toMatchObject({
    status: 401,
  });
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockResolvedValue(response({}, 403));
  await expect(controller.get(tenantA, '/api/User/profile', z.string())).rejects.toMatchObject({
    status: 403,
  });
  expect(fetcher.mock.calls).toHaveLength(1);
});
it('retains credentials for a legacy HTTP 200 unexpected-error envelope', async () => {
  const { controller, fetcher, repository, context } = await sessionSetup();
  fetcher.mockResolvedValueOnce(response({}, 401)).mockResolvedValueOnce(
    response({
      success: false,
      message: 'An unexpected error occurred',
      errors: ['Token refresh failed'],
    }),
  );
  await expect(controller.get(tenantA, '/api/User/profile', z.string())).rejects.toMatchObject({
    reason: 'refused',
  });
  expect(controller.userId).toBe(tenantA);
  expect(await repository.load(context)).toEqual(session);
});
