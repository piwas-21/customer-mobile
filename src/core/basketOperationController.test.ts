import { basketControllerFixture } from '../test/basketController';
import { basketInput, basketOperationId, currentBasketOwner } from '../test/basketOperations';
import { basketResponse } from '../test/basketApi';
import { response } from '../test/transport';
import { deferred } from '../test/deferred';
import { tenantB, tenantA, fixtureDirectory } from '../test/fixtures';
import { SessionRepository } from './sessionRepository';
import { SessionController } from './sessionController';
import { CustomerTransport } from './transport';
import { TenantBoundary } from './tenantContext';
import { BasketOperationController } from './basketOperationController';

it('persists before dispatch, coalesces duplicate taps, then acknowledges only validated success', async () => {
  const { subject, fetcher, repository, context, principal, bootstrap } =
    await basketControllerFixture();
  const entered = deferred<void>();
  const finish = deferred<void>();
  fetcher.mockImplementation(async (url, options) => {
    if (url.includes('/bootstrap?')) return response({ success: true, data: bootstrap });
    expect(await repository.baskets.load(context, principal, currentBasketOwner)).toMatchObject({
      operationId: basketOperationId,
      request: basketInput,
    });
    expect(JSON.parse(options.body ?? '{}')).toMatchObject({ operationId: basketOperationId });
    entered.resolve();
    await finish.promise;
    return response({ success: true, data: basketResponse() });
  });
  const draft = { ...basketInput };
  const first = subject.add(draft, 'en');
  draft.quantity = 3;
  const duplicate = subject.add(basketInput, 'en');
  await entered.promise;
  await expect(subject.recover('en')).rejects.toMatchObject({ status: 409 });
  await expect(subject.add({ ...basketInput, quantity: 3 }, 'en')).rejects.toMatchObject({
    status: 409,
  });
  finish.resolve();
  expect((await Promise.all([first, duplicate])).map((basket) => basket.total)).toEqual([
    17.2, 17.2,
  ]);
  expect(fetcher.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
  expect(await subject.pending()).toBeNull();
});

it('recovers an unknown outcome after controller restart with the original operation and request', async () => {
  const { subject, fetcher, bootstrap, store, principal } = await basketControllerFixture();
  fetcher
    .mockResolvedValueOnce(response({ success: true, data: bootstrap }))
    .mockRejectedValueOnce(new Error('Connection lost after commit'));
  await expect(subject.add(basketInput, 'en')).rejects.toMatchObject({ reason: 'network' });
  const pending = await subject.pending();
  expect(pending?.operationId).toBe(basketOperationId);
  const before = fetcher.mock.calls.length;
  await expect(subject.add(basketInput, 'en')).rejects.toMatchObject({ status: 409 });
  await expect(subject.add({ ...basketInput, quantity: 3 }, 'en')).rejects.toMatchObject({
    status: 409,
  });
  expect(fetcher).toHaveBeenCalledTimes(before);
  subject.dispose();
  const repository = new SessionRepository(store);
  const boundary = new TenantBoundary(fixtureDirectory());
  const context = boundary.select(tenantA);
  const client = new CustomerTransport(boundary, repository.vault, fetcher);
  const sessions = new SessionController(context, client, repository);
  await sessions.initialize();
  const restarted = new BasketOperationController(
    context,
    client,
    repository.baskets,
    sessions,
    principal,
    () => {
      throw new Error('Recovery must not create IDs');
    },
  );
  fetcher.mockResolvedValue(response({ success: true, data: basketResponse() }));
  await expect(restarted.recover('en')).resolves.toMatchObject({ total: 17.2 });
  const writes = fetcher.mock.calls.filter(([, options]) => options.method === 'POST');
  expect(writes).toHaveLength(2);
  expect(writes[0]?.[1].body).toBe(writes[1]?.[1].body);
  expect(await restarted.pending()).toBeNull();
});

it.each([401, 404, 409, 503])(
  'retains a refused operation on HTTP %s; recovery never manufactures a new add',
  async (status) => {
    const { subject, fetcher, bootstrap } = await basketControllerFixture();
    fetcher
      .mockResolvedValueOnce(response({ success: true, data: bootstrap }))
      .mockResolvedValue(response({}, status));
    await expect(subject.add(basketInput, 'en')).rejects.toMatchObject({ status });
    expect((await subject.pending())?.operationId).toBe(basketOperationId);
    await expect(subject.recover('en')).rejects.toMatchObject({ status });
    expect(fetcher.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(2);
  },
);

it('refuses new adds after capability withdrawal but permits explicit recovery of an existing operation', async () => {
  const { subject, fetcher, bootstrap, repository, context, principal, createId } =
    await basketControllerFixture();
  bootstrap.capabilities.ordering = 'disabled';
  await expect(subject.add(basketInput, 'en')).rejects.toMatchObject({ reason: 'refused' });
  expect(await subject.pending()).toBeNull();
  await repository.baskets.prepare(context, principal, basketInput, createId, currentBasketOwner);
  await expect(subject.recover('en')).resolves.toMatchObject({ total: 17.2 });
  expect(fetcher.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
});

it('never creates or submits an operation for an empty recovery', async () => {
  const { subject, fetcher } = await basketControllerFixture();
  await expect(subject.recover('en')).rejects.toMatchObject({ status: 409 });
  expect(fetcher).not.toHaveBeenCalled();
});

it('retains the journal after wrong-owner proof', async () => {
  const { subject, fetcher, bootstrap } = await basketControllerFixture();
  fetcher
    .mockResolvedValueOnce(response({ success: true, data: bootstrap }))
    .mockResolvedValue(response({ success: true, data: { ...basketResponse(), userId: tenantB } }));
  await expect(subject.add(basketInput, 'en')).rejects.toMatchObject({ reason: 'contract' });
  expect((await subject.pending())?.operationId).toBe(basketOperationId);
});

it('finishes a lost cleanup acknowledgement without another POST or allowing a new add', async () => {
  let fail = true;
  const { subject, fetcher } = await basketControllerFixture(false, (store) => ({
    ...store,
    remove: async (key) => {
      await store.remove(key);
      if (key.endsWith('.basket-operation') && fail) {
        fail = false;
        throw new Error('Removal acknowledgement lost');
      }
    },
  }));
  await expect(subject.add(basketInput, 'en')).rejects.toThrow('Removal acknowledgement lost');
  expect((await subject.pending())?.operationId).toBe(basketOperationId);
  await expect(subject.add(basketInput, 'en')).rejects.toMatchObject({ status: 409 });
  await expect(subject.recover('en')).resolves.toMatchObject({ total: 17.2 });
  expect(fetcher.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
  expect(await subject.pending()).toBeNull();
});
