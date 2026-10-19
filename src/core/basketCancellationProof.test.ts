import { pendingCancellationFixture } from '../test/basketCancellation';
import { basketControllerFixture } from '../test/basketController';
import { basketInput, basketOperationId } from '../test/basketOperations';
import { basketResponse } from '../test/basketApi';
import { response } from '../test/transport';
import { tenantA } from '../test/fixtures';
import { basketOperationRecordSchema } from './basketOperationRecord';
import { submitBasketOperation } from '../api/basket';

it.each([
  { operationId: tenantA, outcome: 'Cancelled' },
  { operationId: basketOperationId, outcome: 'Cancelled', basket: basketResponse() },
  {
    operationId: basketOperationId,
    outcome: 'Applied',
    basket: { ...basketResponse(), userId: tenantA },
  },
  {
    operationId: basketOperationId,
    outcome: 'Applied',
    basket: { ...basketResponse(), id: tenantA },
  },
  { operationId: basketOperationId, outcome: 'FutureDecision' },
])('retains the journal on malformed/substituted/contradictory proof %j', async (proof) => {
  const f = await pendingCancellationFixture(true);
  f.fetcher.mockResolvedValue(response({ success: true, data: proof }));
  await expect(f.subject.cancel('en')).rejects.toMatchObject({ reason: 'contract' });
  expect(await f.subject.pending()).toMatchObject({
    operationId: basketOperationId,
    cancellationRequested: true,
  });
  await expect(f.subject.recover('en')).rejects.toMatchObject({ status: 409 });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});

it.each([null, basketResponse()])(
  'accepts Applied proof without pretending to undo or resurrect the original basket (%j)',
  async (basket) => {
    const f = await pendingCancellationFixture(true);
    f.fetcher.mockResolvedValue(
      response({
        success: true,
        data: { operationId: basketOperationId, outcome: 'Applied', basket },
      }),
    );
    expect(await f.subject.cancel('en')).toEqual({
      operationId: basketOperationId,
      outcome: 'Applied',
      basket,
    });
    expect(await f.subject.pending()).toBeNull();
  },
);

it('keeps a successfully persisted cancellation flag when its storage acknowledgement is lost, without HTTP dispatch', async () => {
  let fail = true;
  const f = await pendingCancellationFixture(false, (store) => ({
    ...store,
    set: async (key, value) => {
      await store.set(key, value);
      if (
        key.endsWith('.basket-operation') &&
        value.includes('"cancellationRequested":true') &&
        fail
      ) {
        fail = false;
        throw new Error('Cancellation storage acknowledgement lost');
      }
    },
  }));
  await expect(f.subject.cancel('en')).rejects.toThrow('storage acknowledgement lost');
  expect(f.fetcher).not.toHaveBeenCalled();
  const pending = await f.subject.pending();
  expect(pending).toMatchObject({ cancellationRequested: true });
  await expect(f.subject.recover('en')).rejects.toMatchObject({ status: 409 });
  await expect(
    submitBasketOperation(f.client, f.context, pending!, () => {}, 'en'),
  ).rejects.toMatchObject({ status: 409 });
  expect(f.fetcher).not.toHaveBeenCalled();
  f.fetcher.mockResolvedValue(
    response({ success: true, data: { operationId: basketOperationId, outcome: 'Cancelled' } }),
  );
  await f.subject.cancel('en');
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  expect(await f.subject.pending()).toBeNull();
});

it('finishes a lost secure cleanup acknowledgement from cached cancellation proof without another POST', async () => {
  let fail = true;
  const f = await pendingCancellationFixture(false, (store) => ({
    ...store,
    remove: async (key) => {
      await store.remove(key);
      if (key.endsWith('.basket-operation') && fail) {
        fail = false;
        throw new Error('Cleanup acknowledgement lost');
      }
    },
  }));
  f.fetcher.mockResolvedValue(
    response({ success: true, data: { operationId: basketOperationId, outcome: 'Cancelled' } }),
  );
  await expect(f.subject.cancel('en')).rejects.toThrow('Cleanup acknowledgement lost');
  expect(await f.subject.pending()).toMatchObject({ cancellationRequested: true });
  await expect(f.subject.add(basketInput, 'en')).rejects.toMatchObject({ status: 409 });
  await expect(f.subject.recover('en')).rejects.toMatchObject({ status: 409 });
  await f.subject.cancel('en');
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  expect(await f.subject.pending()).toBeNull();
});

it('uses already validated application proof when cancellation follows an interrupted add cleanup', async () => {
  let fail = true;
  const f = await basketControllerFixture(false, (store) => ({
    ...store,
    remove: async (key) => {
      await store.remove(key);
      if (key.endsWith('.basket-operation') && fail) {
        fail = false;
        throw new Error('Cleanup acknowledgement lost');
      }
    },
  }));
  await expect(f.subject.add(basketInput, 'en')).rejects.toThrow('Cleanup acknowledgement lost');
  expect(await f.subject.cancel('en')).toEqual({
    operationId: basketOperationId,
    outcome: 'Applied',
    basket: basketResponse(),
  });
  expect(f.fetcher.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
  expect(await f.subject.pending()).toBeNull();
});

it('refuses cancellation before session installation and unknown persisted cancellation values', async () => {
  const f = await pendingCancellationFixture();
  for (const patch of [
    { phase: 'installing', cancellationRequested: true },
    { cancellationRequested: false },
    { cancellationRequested: 'later' },
  ])
    expect(basketOperationRecordSchema.safeParse({ ...f.pending, ...patch }).success).toBe(false);
});
