import { tablePlanControllerFixture } from '../test/tablePlanController';
import { deferred } from '../test/deferred';
import { tenantB } from '../test/fixtures';
it.each(['revision', 'scope', 'approval'])(
  'fresh %s change consumes review before custody or submission',
  async (mode) => {
    const f = await tablePlanControllerFixture();
    const review = await f.actor.prepare(f.choice, 'en');
    if (mode === 'revision') f.state.revision = 8;
    if (mode === 'scope') f.state.shifted = true;
    if (mode === 'approval') f.bootstrap.capabilities['table-payments'] = 'disabled';
    await expect(f.actor.confirm(review.operationId, 'en')).rejects.toThrow();
    expect(await f.actor.saved()).toBeNull();
    expect(f.paths().some((path) => path.endsWith('/submit'))).toBe(false);
    await expect(f.actor.confirm(review.operationId, 'en')).rejects.toThrow();
  },
);
it.each(['dismiss', 'dispose', 'owner', 'tenant'])(
  'withdraws a paused split review after %s',
  async (mode) => {
    const f = await tablePlanControllerFixture(true);
    const entered = deferred<void>();
    const release = deferred<void>();
    const normal = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async (url, options) => {
      if (url.endsWith('/prepare')) {
        entered.resolve();
        await release.promise;
      }
      return normal(url, options);
    });
    const pending = f.actor.prepare(f.choice, 'en');
    const rejected = expect(pending).rejects.toThrow();
    await entered.promise;
    if (mode === 'dismiss') f.actor.invalidateReview();
    if (mode === 'dispose') f.actor.dispose();
    if (mode === 'owner') await f.sessions.logout();
    if (mode === 'tenant') f.boundary.clear();
    release.resolve();
    await rejected;
    expect(f.paths().some((path) => path.endsWith('/submit'))).toBe(false);
  },
);
it('coalesces double confirmation and refuses another operation while original submission is pending', async () => {
  const f = await tablePlanControllerFixture();
  const entered = deferred<void>();
  const release = deferred<void>();
  const normal = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation(async (url, options) => {
    if (url.endsWith('/submit')) {
      entered.resolve();
      await release.promise;
    }
    return normal(url, options);
  });
  const review = await f.actor.prepare(f.choice, 'en');
  const pending = f.actor.confirm(review.operationId, 'en');
  await entered.promise;
  expect(f.actor.confirm(review.operationId, 'en')).toBe(pending);
  expect(() => f.actor.stop(review.operationId, 'en')).toThrow();
  release.resolve();
  expect((await pending)?.outcome).toBe('applied');
  expect(f.paths().filter((path) => path.endsWith('/submit'))).toHaveLength(1);
});
it('stale stop and dismissal leave original custody intact', async () => {
  const f = await tablePlanControllerFixture();
  await f.install();
  await expect(f.actor.stop(f.preparation.intent.tenantId, 'en')).rejects.toThrow();
  await expect(f.actor.acknowledge(f.preparation.intent.tenantId)).rejects.toThrow();
  expect((await f.actor.saved())?.operationId).toBe(tenantB);
  expect(f.fetcher).not.toHaveBeenCalled();
});

it('withdraws approval between durable custody and first dispatch', async () => {
  const f = await tablePlanControllerFixture();
  const review = await f.actor.prepare(f.choice, 'en');
  const install = f.repository.tablePlans.install.bind(f.repository.tablePlans);
  jest.spyOn(f.repository.tablePlans, 'install').mockImplementation(async (...args) => {
    const record = await install(...args);
    f.bootstrap.capabilities['table-payments'] = 'disabled';
    return record;
  });
  await expect(f.actor.confirm(review.operationId, 'en')).rejects.toThrow();
  expect((await f.actor.saved())?.outcome).toBe('pending');
  expect(f.paths().some((path) => path.endsWith('/submit'))).toBe(false);
});
