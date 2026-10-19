import { z } from 'zod';
import { ApiFailure, type RequestOptions } from './transport';
import { deferred } from '../test/deferred';
import { setup, response } from '../test/transport';
import { session, sessionSetup, authResponse, dataResponse } from '../test/sessions';

it('captures ownership before credentials yield and refuses a withdrawn write before dispatch', async () => {
  const { client, context, vault, fetcher } = setup();
  const loaded = deferred<typeof session>();
  jest.spyOn(vault, 'session').mockReturnValue(loaded.promise);
  let current = true;
  const options: RequestOptions = {
    method: 'POST',
    body: { quantity: 1 },
    credentials: 'customer',
    principal: { kind: 'customer', id: session.userId },
    assertCurrent: () => {
      if (!current) throw new ApiFailure(401, 'refused');
    },
  };
  const pending = client.request(context, '/api/basket/items', z.string(), options);
  options.assertCurrent = () => {};
  current = false;
  loaded.resolve(session);
  await expect(pending).rejects.toMatchObject({ reason: 'refused' });
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(['response', 'decode'])(
  'withdraws a write owner during %s without retrying it',
  async (stage) => {
    const { client, context, fetcher } = setup();
    const entered = deferred<void>();
    const finish = deferred<void>();
    let current = true;
    const data = response({ success: true, data: 'accepted' });
    if (stage === 'decode')
      data.json = async () => {
        entered.resolve();
        await finish.promise;
        return { success: true, data: 'accepted' };
      };
    fetcher.mockImplementation(async () => {
      if (stage === 'response') {
        entered.resolve();
        await finish.promise;
      }
      return data;
    });
    const pending = client.request(context, '/api/basket/items', z.string(), {
      method: 'POST',
      body: {},
      assertCurrent: () => {
        if (!current) throw new ApiFailure(401, 'refused');
      },
    });
    await entered.promise;
    current = false;
    finish.resolve();
    await expect(pending).rejects.toMatchObject({ reason: 'refused' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

it('stops a private read delayed in SecureStore after logout and same-customer login', async () => {
  const { controller, repository, fetcher } = await sessionSetup();
  const loaded = deferred<typeof session>();
  jest.spyOn(repository.vault, 'session').mockReturnValueOnce(loaded.promise);
  fetcher.mockResolvedValue(authResponse());
  const pending = controller.get(session.userId, '/api/User/profile', z.string());
  await controller.logout();
  await controller.login({ email: 'customer@example.test', password: 'password' }, 'en');
  loaded.resolve(session);
  await expect(pending).rejects.toMatchObject({ reason: 'refused' });
  expect(fetcher.mock.calls).toHaveLength(1);
  expect(fetcher.mock.calls[0]?.[0]).toContain('/login');
  fetcher.mockResolvedValue(dataResponse());
  await expect(controller.get(session.userId, '/api/User/profile', z.string())).resolves.toBe(
    'private profile',
  );
});
