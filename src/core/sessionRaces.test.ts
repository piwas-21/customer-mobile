import { z } from 'zod';
import { tenantA, tenantB, fixtureDirectory, memorySecrets } from '../test/fixtures';
import { response } from '../test/transport';
import { session, renewed, authResponse, dataResponse, sessionSetup } from '../test/sessions';
import { SessionController } from './sessionController';
import { SessionRepository } from './sessionRepository';
import { CustomerTransport, type Fetch } from './transport';
import { TenantBoundary } from './tenantContext';
it('quarantines a failed refresh rollback and completes durable logout cleanup', async () => {
  const store = memorySecrets();
  const boundary = new TenantBoundary(fixtureDirectory());
  const context = boundary.select(tenantA);
  let hold = false;
  let failRollback = false;
  let entered: () => void = () => {
    throw new Error('Gate unavailable');
  };
  let release: () => void = () => {
    throw new Error('Gate unavailable');
  };
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const repository = new SessionRepository({
    ...store,
    set: async (key, value) => {
      if (key.endsWith('.session') && value.includes('new-access') && hold) {
        entered();
        await gate;
      }
      if (key.endsWith('.session') && value.includes('old-access') && failRollback)
        throw new Error('Rollback refused');
      await store.set(key, value);
    },
  });
  await repository.activate(context, session, () => true);
  const fetcher = jest
    .fn<ReturnType<Fetch>, Parameters<Fetch>>()
    .mockResolvedValueOnce(response({}, 401))
    .mockResolvedValueOnce(authResponse());
  const client = new CustomerTransport(boundary, repository.vault, fetcher);
  const controller = new SessionController(context, client, repository);
  await controller.initialize();
  hold = true;
  const pending = controller.get(tenantA, '/api/User/profile', z.string());
  await started;
  const logout = controller.logout();
  failRollback = true;
  release();
  await expect(pending).rejects.toThrow('Secure session update incomplete');
  await logout;
  expect(store.values.size).toBe(0);
  expect(await repository.load(context)).toBeNull();
  const restarted = new SessionController(context, client, repository);
  expect(await restarted.initialize()).toBeNull();
});
it('rejects an A read started during B login if B becomes active before A responds', async () => {
  const { controller, fetcher } = await sessionSetup();
  let enterLogin: () => void = () => {
    throw new Error('Gate unavailable');
  };
  let enterRead: () => void = () => {
    throw new Error('Gate unavailable');
  };
  let finishLogin: (value: Response) => void = () => {
    throw new Error('Gate unavailable');
  };
  let finishRead: (value: Response) => void = () => {
    throw new Error('Gate unavailable');
  };
  const loginStarted = new Promise<void>((resolve) => {
    enterLogin = resolve;
  });
  const readStarted = new Promise<void>((resolve) => {
    enterRead = resolve;
  });
  fetcher.mockImplementation(
    (url) =>
      new Promise<Response>((resolve) => {
        if (url.endsWith('/login')) {
          finishLogin = resolve;
          enterLogin();
        } else {
          finishRead = resolve;
          enterRead();
        }
      }),
  );
  const login = controller.login({ email: 'next@example.test', password: 'password' }, 'en');
  await loginStarted;
  const read = controller.get(tenantA, '/api/User/profile', z.string());
  await readStarted;
  finishLogin(authResponse({ ...renewed, userId: tenantB }));
  await login;
  expect(controller.userId).toBe(tenantB);
  finishRead(dataResponse());
  await expect(read).rejects.toMatchObject({ reason: 'refused' });
});
