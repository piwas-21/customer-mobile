import { z } from 'zod';
import { tenantA, tenantB, fixtureDirectory } from '../test/fixtures';
import { renewed, authResponse, dataResponse, sessionSetup } from '../test/sessions';
import { SessionController } from './sessionController';
import { CustomerTransport } from './transport';
import { TenantBoundary } from './tenantContext';
it('drops a private response after logout and then clears its persisted session', async () => {
  const { controller, fetcher, repository, context } = await sessionSetup();
  let release: (value: Response) => void = () => {
    throw new Error('Gate unavailable');
  };
  let started: () => void = () => {
    throw new Error('Gate unavailable');
  };
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  fetcher.mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
        started();
      }),
  );
  const pending = controller.get(tenantA, '/api/User/profile', z.string());
  await entered;
  const logout = controller.logout();
  expect(controller.userId).toBeNull();
  expect(await repository.load(context)).toBeNull();
  const restarted = new SessionController(
    context,
    new CustomerTransport(new TenantBoundary(fixtureDirectory()), repository.vault, fetcher),
    repository,
  );
  expect(await restarted.initialize()).toBeNull();
  release(dataResponse());
  await expect(pending).rejects.toMatchObject({ reason: 'refused' });
  await logout;
  expect(await repository.load(context)).toBeNull();
});
it('cancels a queued login before dispatch when logout wins', async () => {
  const { controller, fetcher, repository, context } = await sessionSetup(false);
  const login = controller.login({ email: 'guest@example.test', password: 'password' }, 'en');
  const logout = controller.logout();
  await expect(login).rejects.toMatchObject({ reason: 'refused' });
  await logout;
  expect(fetcher).not.toHaveBeenCalled();
  expect(await repository.load(context)).toBeNull();
});
it('an obsolete restaurant controller cannot clear a newer login for the same user', async () => {
  const { controller, boundary, repository, fetcher } = await sessionSetup();
  boundary.select(tenantB);
  const nextContext = boundary.select(tenantA);
  const next = new SessionController(
    nextContext,
    new CustomerTransport(boundary, repository.vault, fetcher),
    repository,
  );
  fetcher.mockResolvedValue(authResponse());
  await next.login({ email: 'guest@example.test', password: 'password' }, 'en');
  await controller.logout();
  expect(await repository.load(nextContext)).toEqual(renewed);
  expect(next.userId).toBe(tenantA);
});
