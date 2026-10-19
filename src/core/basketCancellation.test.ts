import { BasketOperationController } from './basketOperationController';
import { SessionRepository } from './sessionRepository';
import { pendingCancellationFixture } from '../test/basketCancellation';
import { basketMutation } from '../test/basketMutations';
import { basketInput, basketOperationId, currentBasketOwner } from '../test/basketOperations';
import { response } from '../test/transport';
import { deferred } from '../test/deferred';
import { tenantA } from '../test/fixtures';
import { session } from '../test/sessions';

it.each([false, true])(
  'persists explicit cancellation before dispatching the exact original add/edit (%s)',
  async (edit) => {
    const f = await pendingCancellationFixture(edit);
    await f.repository.vault.saveSession(f.context, session);
    expect(await f.repository.vault.session(f.context, session.userId)).toEqual(session);
    f.fetcher.mockImplementation(async (url, options) => {
      expect(options.headers?.['X-Session-Id']).toBe(f.pending.sessionId);
      expect(options.headers).not.toHaveProperty('Authorization');
      const saved = await f.repository.baskets.load(f.context, f.principal, currentBasketOwner);
      expect(saved).toEqual({ ...f.pending, cancellationRequested: true });
      if (edit) {
        expect(new URL(url).pathname).toBe(
          `/api/customer-mobile/basket/items/${basketMutation().basketItemId}/operations/cancel`,
        );
        const { basketItemId: _, ...request } = basketMutation();
        expect(JSON.parse(options.body!)).toEqual({ ...request, operationId: basketOperationId });
      } else {
        expect(new URL(url).pathname).toBe('/api/customer-mobile/basket/items/cancel');
        expect(JSON.parse(options.body!)).toEqual({
          ...basketInput,
          operationId: basketOperationId,
        });
      }
      return response({
        success: true,
        data: { operationId: basketOperationId, outcome: 'Cancelled' },
      });
    });
    expect(await f.subject.cancel('en')).toEqual({
      operationId: basketOperationId,
      outcome: 'Cancelled',
      basket: null,
    });
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect(await f.subject.pending()).toBeNull();
  },
);

it('restores a lost cancellation decision after process restart without submitting the original effect', async () => {
  const f = await pendingCancellationFixture(true);
  f.fetcher.mockRejectedValueOnce(new Error('Lost after cancellation commit'));
  await expect(f.subject.cancel('en')).rejects.toMatchObject({ reason: 'network' });
  expect(await f.subject.pending()).toMatchObject({ cancellationRequested: true });
  const first = f.fetcher.mock.calls[0]!;
  f.subject.dispose();
  const repository = new SessionRepository(f.store);
  const restarted = new BasketOperationController(
    f.context,
    f.client,
    repository.baskets,
    f.sessions,
    f.principal,
    () => {
      throw new Error('Cancellation cannot create identities');
    },
  );
  await expect(restarted.recover('en')).rejects.toMatchObject({ status: 409 });
  await expect(restarted.add(basketInput, 'en')).rejects.toMatchObject({ status: 409 });
  await expect(restarted.mutate(basketMutation(), 'en')).rejects.toMatchObject({ status: 409 });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  f.fetcher.mockResolvedValue(
    response({
      success: true,
      data: { operationId: basketOperationId, outcome: 'Cancelled', basket: null },
    }),
  );
  await restarted.cancel('en');
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  const retry = f.fetcher.mock.calls[1]!;
  expect(retry[0]).toBe(first[0]);
  expect(retry[1].body).toBe(first[1].body);
  expect(await restarted.pending()).toBeNull();
});

it('refuses empty cancellation and never marks or replaces a different operation', async () => {
  const f = await pendingCancellationFixture();
  await expect(
    f.repository.baskets.requestCancellation(f.context, f.principal, tenantA, currentBasketOwner),
  ).rejects.toThrow('changed');
  expect(await f.subject.pending()).toEqual(f.pending);
  expect(f.fetcher).not.toHaveBeenCalled();
  await f.repository.baskets.finish(f.context, f.principal, basketOperationId, currentBasketOwner);
  await expect(f.subject.cancel('en')).rejects.toMatchObject({ status: 409 });
  expect(f.fetcher).not.toHaveBeenCalled();
});

it('coalesces explicit cancel taps and blocks competing original recovery/add/edit while it is active', async () => {
  const f = await pendingCancellationFixture();
  const entered = deferred<void>();
  const returned = deferred<void>();
  f.fetcher.mockImplementation(async () => {
    entered.resolve();
    await returned.promise;
    return response({
      success: true,
      data: { operationId: basketOperationId, outcome: 'Cancelled' },
    });
  });
  const first = f.subject.cancel('en');
  const duplicate = f.subject.cancel('en');
  await entered.promise;
  try {
    await expect(f.subject.add(basketInput, 'en')).rejects.toMatchObject({ status: 409 });
    await expect(f.subject.mutate(basketMutation(), 'en')).rejects.toMatchObject({ status: 409 });
    await expect(f.subject.recover('en')).rejects.toMatchObject({ status: 409 });
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  } finally {
    returned.resolve();
  }
  expect(await Promise.all([first, duplicate])).toEqual([
    { operationId: basketOperationId, outcome: 'Cancelled', basket: null },
    { operationId: basketOperationId, outcome: 'Cancelled', basket: null },
  ]);
  expect(await f.subject.pending()).toBeNull();
});

it('retains a late cancellation after owner disposal for a new controller to resolve explicitly', async () => {
  const f = await pendingCancellationFixture();
  const entered = deferred<void>();
  const returned = deferred<void>();
  f.fetcher.mockImplementation(async () => {
    entered.resolve();
    await returned.promise;
    return response({
      success: true,
      data: { operationId: basketOperationId, outcome: 'Cancelled' },
    });
  });
  const cancelling = f.subject.cancel('en');
  await entered.promise;
  f.subject.dispose();
  returned.resolve();
  await expect(cancelling).rejects.toMatchObject({ reason: 'refused' });
  const next = f.controller();
  expect(await next.pending()).toMatchObject({
    cancellationRequested: true,
    operationId: basketOperationId,
  });
  await expect(next.recover('en')).rejects.toMatchObject({ status: 409 });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
