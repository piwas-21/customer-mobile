import { tablePlanControllerFixture } from '../test/tablePlanController';
import { tablePlanPath } from './tablePlanRequest';
import { roundGuard } from '../test/tableRoundRepository';
import { secretKey } from './credentials';
import { paymentReadSession } from '../test/tablePaymentAccount';
it.each([false, true])(
  'reviews fourteen CHF in independent ordered shares and acknowledges before one submit: customer=%s',
  async (customer) => {
    const f = await tablePlanControllerFixture(customer);
    const review = await f.actor.prepare(f.choice, 'en');
    expect(review).toEqual({
      operationId: f.choice.supersedesPlanId ?? f.preparation.intent.operationId,
      totalMinor: 1400,
      currency: 'CHF',
      sharesMinor: [465, 465, 470],
    });
    expect(await f.actor.saved()).toBeNull();
    expect(JSON.stringify(review)).not.toMatch(
      /ownerProof|payloadHash|participantToken|sessionId|planId/,
    );
    const normal = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async (url, options) => {
      if (url.endsWith('/submit')) {
        const saved = await f.repository.tablePlans.load(f.context, f.principal, roundGuard);
        expect(saved?.proof.ownerProof).toBe('protected-table-plan-fixture');
        expect(saved?.review.sharesMinor).toEqual([465, 465, 470]);
        expect(JSON.parse(options.body!)).toEqual({ intent: saved!.intent, proof: saved!.proof });
      }
      return normal(url, options);
    });
    expect((await f.actor.confirm(review.operationId, 'en'))?.outcome).toBe('applied');
    expect(f.paths().filter((path) => path === tablePlanPath + '/submit')).toHaveLength(1);
    await expect(f.actor.confirm(review.operationId, 'en')).rejects.toThrow();
    await f.actor.acknowledge(review.operationId);
    expect(await f.actor.saved()).toBeNull();
  },
);
it('reviews exact custom order without implying a payment', async () => {
  const f = await tablePlanControllerFixture();
  const review = await f.actor.prepare(
    { ...f.choice, shareCount: 2, customAmountsMinor: [400, 1000] },
    'en',
  );
  expect(review.sharesMinor).toEqual([400, 1000]);
  await f.actor.confirm(review.operationId, 'en');
  expect(f.paths().some((path) => path.includes('/checkout/'))).toBe(false);
  const saved = await f.repository.tablePlans.load(f.context, f.principal, roundGuard);
  expect(saved?.resolution?.planId).toBe(paymentReadSession);
});
it('lost submit response restores original proof without another submission', async () => {
  const f = await tablePlanControllerFixture();
  const review = await f.actor.prepare(f.choice, 'en');
  const normal = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation(async (url, options) => {
    const result = await normal(url, options);
    if (url.endsWith('/submit')) throw new Error('Lost original reply');
    return result;
  });
  await expect(f.actor.confirm(review.operationId, 'en')).rejects.toThrow();
  expect((await f.actor.saved())?.outcome).toBe('pending');
  const resumed = f.actorFactory();
  expect((await resumed.recover('en'))?.outcome).toBe('applied');
  expect(f.paths().filter((path) => path === tablePlanPath + '/submit')).toHaveLength(1);
});
it('unseen retains original hold until acknowledged permanent stop after participant withdrawal', async () => {
  const f = await tablePlanControllerFixture();
  await f.install();
  await f.store.remove(secretKey(f.context, 'table-participant', f.principal));
  await f.store.remove(secretKey(f.context, 'guest-session', f.principal));
  expect((await f.actor.recover('en'))?.outcome).toBe('pending');
  await expect(f.actor.acknowledge(f.prepared.proof.operationId)).rejects.toThrow();
  expect((await f.actor.stop(f.prepared.proof.operationId, 'en'))?.outcome).toBe('stopped');
  await f.actor.acknowledge(f.prepared.proof.operationId);
  expect(await f.actor.saved()).toBeNull();
});
it('silent custody write failure never dispatches submission', async () => {
  const f = await tablePlanControllerFixture();
  const review = await f.actor.prepare(f.choice, 'en');
  const key = secretKey(f.context, 'table-plan-operation', f.principal);
  const set = f.store.set;
  jest
    .spyOn(f.store, 'set')
    .mockImplementation((k, v) => (k === key ? Promise.resolve() : set(k, v)));
  await expect(f.actor.confirm(review.operationId, 'en')).rejects.toThrow();
  expect(f.paths().filter((path) => path.endsWith('/submit'))).toHaveLength(0);
  await expect(f.actor.confirm(review.operationId, 'en')).rejects.toThrow();
});

it('consumes the original review before custody so acknowledged dismissal cannot resurrect its submission', async () => {
  const f = await tablePlanControllerFixture();
  const review = await f.actor.prepare(f.choice, 'en');
  await f.actor.confirm(review.operationId, 'en');
  await f.actor.acknowledge(review.operationId);
  const before = f.fetcher.mock.calls.length;
  await expect(f.actor.confirm(review.operationId, 'en')).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(before);
  expect(await f.actor.saved()).toBeNull();
});
