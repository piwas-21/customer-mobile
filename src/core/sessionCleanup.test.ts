import { SessionController } from './sessionController';
import { SessionRepository } from './sessionRepository';
import { secretKey } from './credentials';
import { sessionSetup, session } from '../test/sessions';
import { tenantA } from '../test/fixtures';
it('persists unfinished logout cleanup across restart and refuses a new login until cleanup succeeds', async () => {
  const { store, context, repository, client, controller, fetcher } = await sessionSetup();
  await repository.vault.saveCapability(
    context,
    'guest-order',
    { kind: 'customer', id: tenantA },
    'order-secret',
  );
  const key = secretKey(context, 'session', { kind: 'customer', id: tenantA });
  const remove = store.remove;
  let fail = true;
  jest
    .spyOn(store, 'remove')
    .mockImplementation((candidate) =>
      fail && candidate === key ? Promise.reject(new Error('Locked')) : remove(candidate),
    );
  await expect(controller.logout()).rejects.toThrow('Credential removal incomplete');
  expect(controller.userId).toBeNull();
  expect(controller.needsCleanup).toBe(true);
  await expect(
    controller.login({ email: 'guest@example.test', password: 'password' }, 'en'),
  ).rejects.toMatchObject({ reason: 'refused' });
  expect(fetcher).not.toHaveBeenCalled();
  expect(store.values.has(`v2.staging.${tenantA}.active-customer`)).toBe(false);
  const restartedRepository = new SessionRepository(store);
  const restarted = new SessionController(context, client, restartedRepository);
  await expect(restarted.initialize()).rejects.toThrow('Credential removal incomplete');
  await expect(
    restartedRepository.activate(context, { ...session, accessToken: 'new' }, () => true),
  ).rejects.toThrow('Credential removal incomplete');
  fail = false;
  expect(await restarted.initialize()).toBeNull();
  expect(store.values.size).toBe(0);
  await controller.logout();
  expect(controller.needsCleanup).toBe(false);
});
