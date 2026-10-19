import { basketControllerFixture } from '../test/basketController';
import { basketInput } from '../test/basketOperations';
import { basketResponse } from '../test/basketApi';
import { response } from '../test/transport';
import { deferred } from '../test/deferred';
import { tenantB } from '../test/fixtures';
import { session, sessionSetup, authResponse } from '../test/sessions';
import { SessionController } from './sessionController';

it('requires initialized identity and refuses owner capture during login', async () => {
  const { context, client, repository, fetcher } = await sessionSetup(false);
  const sessions = new SessionController(context, client, repository);
  const guest = { kind: 'guest', id: 'basket' } as const;
  expect(() => sessions.captureRequestOwner(guest)).toThrow();
  await sessions.initialize();
  const guard = sessions.captureRequestOwner(guest);
  const finish = deferred<Response>();
  const entered = deferred<void>();
  fetcher.mockImplementation(() => {
    entered.resolve();
    return finish.promise;
  });
  const login = sessions.login({ email: 'customer@example.test', password: 'password' }, 'en');
  expect(guard).toThrow();
  expect(() => sessions.captureRequestOwner(guest)).toThrow();
  await entered.promise;
  await sessions.logout();
  expect(sessions.captureRequestOwner(guest)).not.toThrow();
  finish.resolve(authResponse());
  await expect(login).rejects.toMatchObject({ reason: 'refused' });
  expect(sessions.captureRequestOwner(guest)).not.toThrow();
});

it('binds both customer identity and login revision, including same-customer relogin', async () => {
  const { controller, fetcher } = await sessionSetup();
  expect(() => controller.captureRequestOwner({ kind: 'guest', id: 'basket' })).toThrow();
  expect(() => controller.captureRequestOwner({ kind: 'customer', id: tenantB })).toThrow();
  const principal = { kind: 'customer', id: session.userId } as const;
  const guard = controller.captureRequestOwner(principal);
  expect(guard).not.toThrow();
  await controller.logout();
  fetcher.mockResolvedValue(authResponse());
  await controller.login({ email: 'customer@example.test', password: 'password' }, 'en');
  expect(guard).toThrow();
  expect(controller.captureRequestOwner(principal)).not.toThrow();
});

it('stops before private persistence or POST when logout occurs during bootstrap', async () => {
  const { subject, sessions, fetcher, bootstrap, store } = await basketControllerFixture(true);
  const entered = deferred<void>();
  const finish = deferred<void>();
  fetcher.mockImplementation(async () => {
    entered.resolve();
    await finish.promise;
    return response({ success: true, data: bootstrap });
  });
  const pending = subject.add(basketInput, 'en');
  await entered.promise;
  await sessions.logout();
  finish.resolve();
  await expect(pending).rejects.toMatchObject({ reason: 'refused' });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(store.values.size).toBe(0);
});

it.each(['logout', 'dispose', 'switch'])(
  'rejects late add proof after %s without retry',
  async (change) => {
    const { subject, sessions, boundary, fetcher, bootstrap } = await basketControllerFixture(true);
    const entered = deferred<void>();
    const finish = deferred<void>();
    fetcher.mockImplementation(async (url) => {
      if (url.includes('/bootstrap?')) return response({ success: true, data: bootstrap });
      entered.resolve();
      await finish.promise;
      return response({ success: true, data: basketResponse(session.userId) });
    });
    const pending = subject.add(basketInput, 'en');
    await entered.promise;
    if (change === 'logout') await sessions.logout();
    if (change === 'dispose') subject.dispose();
    if (change === 'switch') boundary.select(tenantB);
    finish.resolve();
    await expect(pending).rejects.toThrow();
    expect(fetcher.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
    await expect(subject.pending()).rejects.toThrow();
  },
);

it('never dispatches after secure persistence failure', async () => {
  const { subject, fetcher } = await basketControllerFixture(false, (store) => ({
    ...store,
    set: async (key, value) => {
      if (key.endsWith('.basket-operation')) throw new Error('Secure storage unavailable');
      await store.set(key, value);
    },
  }));
  await expect(subject.add(basketInput, 'en')).rejects.toThrow('Secure storage unavailable');
  expect(fetcher.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(0);
});
