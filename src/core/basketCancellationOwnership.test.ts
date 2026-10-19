import { basketControllerFixture } from '../test/basketController';
import { basketInput, basketOperationId, currentBasketOwner } from '../test/basketOperations';
import { basketResponse } from '../test/basketApi';
import { session } from '../test/sessions';
import { response } from '../test/transport';
import { deferred } from '../test/deferred';
import { secretKey } from './credentials';
import { BasketWorkspace } from './basketWorkspace';

async function customerFixture() {
  const f = await basketControllerFixture(true);
  const pending = await f.repository.baskets.prepare(
    f.context,
    f.principal,
    basketInput,
    f.createId,
    f.sessions.captureRequestOwner(f.principal),
  );
  return { ...f, pending };
}

it('cancels through the owned workspace using the exact customer JWT and original basket session', async () => {
  const f = await customerFixture();
  const workspace = new BasketWorkspace(
    f.context,
    f.client,
    f.repository,
    f.sessions,
    f.principal,
    f.createId,
  );
  const owned = basketResponse(session.userId);
  f.fetcher.mockResolvedValue(
    response({
      success: true,
      data: { operationId: basketOperationId, outcome: 'Applied', basket: owned },
    }),
  );
  expect(await workspace.cancel('en')).toEqual({
    operationId: basketOperationId,
    outcome: 'Applied',
    basket: owned,
  });
  const headers = f.fetcher.mock.calls[0]![1].headers;
  expect(headers?.Authorization).toBe(`Bearer ${session.accessToken}`);
  expect(headers?.['X-Session-Id']).toBe(f.pending.sessionId);
  expect(await workspace.hasPending()).toBe(false);
});

it('refuses cancellation after logout during customer credential loading, without dispatch or retained private storage', async () => {
  const f = await customerFixture();
  const entered = deferred<void>();
  const loaded = deferred<typeof session>();
  jest.spyOn(f.repository.vault, 'session').mockImplementationOnce(() => {
    entered.resolve();
    return loaded.promise;
  });
  const cancelling = f.subject.cancel('en');
  await entered.promise;
  await f.sessions.logout();
  loaded.resolve(session);
  await expect(cancelling).rejects.toMatchObject({ status: 401 });
  expect(f.fetcher).not.toHaveBeenCalled();
  expect(await f.store.get(secretKey(f.context, 'basket-operation', f.principal))).toBeNull();
  expect(await f.repository.baskets.load(f.context, f.principal, currentBasketOwner)).toBeNull();
});
