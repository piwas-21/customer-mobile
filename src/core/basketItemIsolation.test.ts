import { BasketOperationController } from './basketOperationController';
import { BasketWorkspace } from './basketWorkspace';
import { secretKey } from './credentials';
import { basketControllerFixture } from '../test/basketController';
import { basketMutation, existingBasketSession } from '../test/basketMutations';
import { basketResponse } from '../test/basketApi';
import { basketOperationId, basketSessionId } from '../test/basketOperations';
import { deferred } from '../test/deferred';
import { session } from '../test/sessions';
import { response } from '../test/transport';

it.each([false, true])(
  'dispatches an edit only with its captured guest/customer credentials (%s)',
  async (customer) => {
    const f = await basketControllerFixture(customer);
    // A customer may retain the guest's credentials without permitting guest transport to borrow them.
    await f.repository.vault.saveSession(f.context, session);
    expect(f.createId()).toBe(basketSessionId);
    await f.repository.vault.saveCapability(
      f.context,
      'guest-session',
      f.principal,
      basketSessionId,
    );
    await f.subject.mutate(basketMutation('Remove'), 'en');
    const writes = f.fetcher.mock.calls.filter(([, options]) => options.method === 'POST');
    expect(writes).toHaveLength(1);
    const headers = writes[0]![1].headers;
    expect(headers?.['X-Session-Id']).toBe(basketSessionId);
    if (customer) expect(headers?.Authorization).toBe(`Bearer ${session.accessToken}`);
    else expect(headers).not.toHaveProperty('Authorization');
    expect(await f.subject.pending()).toBeNull();
  },
);

it('refuses a customer edit after logout while waiting for credentials, without dispatching it', async () => {
  const f = await basketControllerFixture(true);
  expect(f.createId()).toBe(basketSessionId);
  await f.repository.vault.saveCapability(f.context, 'guest-session', f.principal, basketSessionId);
  const entered = deferred<void>();
  const loaded = deferred<typeof session>();
  jest.spyOn(f.repository.vault, 'session').mockImplementationOnce(() => {
    entered.resolve();
    return loaded.promise;
  });
  const editing = f.subject.mutate(basketMutation(), 'en');
  await entered.promise;
  await f.sessions.logout();
  loaded.resolve(session);
  await expect(editing).rejects.toMatchObject({ status: 401 });
  expect(f.fetcher.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(0);
  expect(await f.store.get(secretKey(f.context, 'basket-operation', f.principal))).toBeNull();
});

it('cannot acknowledge a late edit after disposal and recovers that exact operation in a new controller', async () => {
  const f = await basketControllerFixture();
  await existingBasketSession(f);
  const entered = deferred<void>();
  const returned = deferred<void>();
  f.fetcher.mockImplementation(async (url) => {
    if (url.includes('/bootstrap?')) return response({ success: true, data: f.bootstrap });
    entered.resolve();
    await returned.promise;
    return response({ success: true, data: basketResponse() });
  });
  const editing = f.subject.mutate(basketMutation(), 'en');
  await entered.promise;
  f.subject.dispose();
  returned.resolve();
  await expect(editing).rejects.toMatchObject({ reason: 'refused' });
  const restarted = new BasketOperationController(
    f.context,
    f.client,
    f.repository.baskets,
    f.sessions,
    f.principal,
    () => {
      throw new Error('Recovery cannot generate a replacement identity');
    },
  );
  expect(await restarted.pending()).toMatchObject({
    schemaVersion: 2,
    operationId: basketOperationId,
  });
  f.fetcher.mockResolvedValue(response({ success: true, data: basketResponse() }));
  await restarted.recover('en');
  const writes = f.fetcher.mock.calls.filter(([, options]) => options.method === 'POST');
  expect(writes).toHaveLength(2);
  expect(writes[0]![1].body).toBe(writes[1]![1].body);
  expect(await restarted.pending()).toBeNull();
});

it('does not dispatch an edit when secure persistence cannot read back the exact intent', async () => {
  const f = await basketControllerFixture(false, (store) => ({
    ...store,
    set: (key, value) => store.set(key, key.endsWith('.basket-operation') ? '{truncated' : value),
  }));
  await existingBasketSession(f);
  const workspace = new BasketWorkspace(
    f.context,
    f.client,
    f.repository,
    f.sessions,
    f.principal,
    f.createId,
  );
  await expect(workspace.mutate(basketMutation(), 'en')).rejects.toThrow('save incomplete');
  expect(f.fetcher.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(0);
  await expect(f.subject.pending()).rejects.toThrow();
  await expect(f.subject.mutate(basketMutation('Remove'), 'en')).rejects.toThrow();
  expect(f.fetcher.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(0);
});
