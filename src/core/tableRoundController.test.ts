import { tableRoundControllerFixture } from '../test/tableRoundController';
import { tableRoundPath } from './tableRoundRequest';
import { response } from '../test/transport';
import { secretKey } from './credentials';
import { tenantA, tenantB } from '../test/fixtures';

it.each([false, true])(
  'reviews server-priced shared composition and coalesces one original confirmed round: customer=%s',
  async (customer) => {
    const f = await tableRoundControllerFixture(customer);
    expect(await f.actor.saved()).toBeNull();
    const review = await f.actor.prepare('fr');
    expect(review.quote.money.total).toBe(14);
    expect(review.tableLabel).toBe('Garden');
    expect(JSON.stringify(review)).not.toMatch(/ownerProof|participantToken|sessionId/);
    const result = await Promise.all([
      f.actor.confirm(review.operationId, 'fr'),
      f.actor.confirm(review.operationId, 'fr'),
    ]);
    expect(result[0]).toEqual({
      operationId: tenantB,
      serviceSessionId: tenantA,
      outcome: 'Applied',
      orderId: tenantB,
      cancellationRequested: false,
    });
    expect(result[1]).toEqual(result[0]);
    expect(f.fetcher.mock.calls.filter(([url]) => url.endsWith('/submit'))).toHaveLength(1);
    expect(f.createId).toHaveBeenCalledTimes(1);
    await expect(f.actor.confirm(review.operationId, 'fr')).rejects.toThrow();
    expect(await f.actorFactory().saved()).toEqual(result[0]);
    await f.actor.acknowledge(review.operationId);
    expect(await f.actor.saved()).toBeNull();
  },
);
it('never repeats a lost initial submission; restart exposes only the original minimal recovery', async () => {
  const f = await tableRoundControllerFixture();
  const review = await f.actor.prepare('en');
  const normal = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation(async (url, options) => {
    if (url.endsWith('/submit')) throw new Error('Response lost');
    if (url.endsWith('/recover'))
      return response({
        success: true,
        data: {
          schemaVersion: 1,
          operationId: tenantB,
          serviceSessionId: tenantA,
          outcome: 'Unseen',
          orderId: null,
        },
      });
    if (url.endsWith('/cancel-attempt'))
      return response({
        success: true,
        data: {
          schemaVersion: 1,
          operationId: tenantB,
          serviceSessionId: tenantA,
          outcome: 'Cancelled',
          orderId: null,
        },
      });
    return normal(url, options);
  });
  await expect(f.actor.confirm(review.operationId, 'en')).rejects.toThrow();
  f.actor.dispose();
  const restarted = f.actorFactory();
  const calls = f.fetcher.mock.calls.length;
  const saved = await restarted.saved();
  expect(saved).toEqual({
    operationId: tenantB,
    serviceSessionId: tenantA,
    outcome: 'Pending',
    orderId: null,
    cancellationRequested: false,
  });
  expect(f.fetcher).toHaveBeenCalledTimes(calls);
  expect(await restarted.recover('en')).toEqual(saved);
  await expect(restarted.prepare('en')).rejects.toThrow();
  await expect(restarted.confirm(review.operationId, 'en')).rejects.toThrow();
  await expect(restarted.acknowledge(review.operationId)).rejects.toThrow();
  expect((await restarted.cancelAttempt(review.operationId, 'en'))?.outcome).toBe('Cancelled');
  expect(f.fetcher.mock.calls.filter(([url]) => url.endsWith('/submit'))).toHaveLength(1);
  const stop = f.fetcher.mock.calls.find(([url]) => url.endsWith('/cancel-attempt'))!;
  expect(JSON.parse(stop[1].body!)).toEqual(f.prepared.proof);
  expect(f.createId).toHaveBeenCalledTimes(1);
});
it('a lost secure acknowledgement preserves any saved claim and consumes the original review before submission', async () => {
  const f = await tableRoundControllerFixture();
  const review = await f.actor.prepare('en');
  const key = secretKey(f.context, 'table-round-operation', f.principal);
  const set = f.store.set;
  const write = jest.spyOn(f.store, 'set').mockImplementation(async (k, v) => {
    await set(k, v);
    if (k === key) throw new Error('Lost secure acknowledgement');
  });
  await expect(f.actor.confirm(review.operationId, 'en')).rejects.toThrow(
    'Lost secure acknowledgement',
  );
  write.mockRestore();
  expect((await f.actor.saved())?.outcome).toBe('Pending');
  await expect(f.actor.confirm(review.operationId, 'en')).rejects.toThrow();
  expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/submit'))).toBe(false);
});
it.each(['flag', 'currency', 'account', 'participant'])(
  'current %s withdrawal refuses the old review before first submission',
  async (field) => {
    const f = await tableRoundControllerFixture(true);
    const review = await f.actor.prepare('en');
    if (field === 'flag') f.request.bootstrap.flags.tableGuestVisitsV1 = false;
    if (field === 'currency') f.request.bootstrap.currency = 'EUR';
    if (field === 'account') f.request.bootstrap.capabilities.accounts = 'disabled';
    if (field === 'participant')
      await f.store.remove(secretKey(f.context, 'table-participant', f.principal));
    await expect(f.actor.confirm(review.operationId, 'en')).rejects.toThrow();
    expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/submit'))).toBe(false);
  },
);
it('a capability withdrawal after secure installation keeps recovery custody and refuses new dispatch', async () => {
  const f = await tableRoundControllerFixture();
  const review = await f.actor.prepare('en');
  const set = f.store.set;
  jest.spyOn(f.store, 'set').mockImplementation(async (k, v) => {
    await set(k, v);
    if (k.endsWith('.table-round-operation')) f.request.bootstrap.flags.tableGuestVisitsV1 = false;
  });
  await expect(f.actor.confirm(review.operationId, 'en')).rejects.toThrow();
  expect((await f.actor.saved())?.outcome).toBe('Pending');
  expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/submit'))).toBe(false);
  expect((await f.actor.recover('en'))?.outcome).toBe('Applied');
});
it('a late Applied decision still wins an explicit stop without creating a new operation', async () => {
  const f = await tableRoundControllerFixture();
  await f.install();
  expect((await f.actor.cancelAttempt(tenantB, 'en'))?.outcome).toBe('Applied');
  expect(f.createId).not.toHaveBeenCalled();
  expect(f.fetcher.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
    tableRoundPath + '/cancel-attempt',
  ]);
});
