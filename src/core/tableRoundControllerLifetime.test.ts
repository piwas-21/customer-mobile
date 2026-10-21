import { tableRoundControllerFixture } from '../test/tableRoundController';
import { deferred } from '../test/deferred';
import { response } from '../test/transport';
import { tenantA, tenantB } from '../test/fixtures';

it.each(['dismiss', 'dispose', 'owner', 'tenant'])(
  'a paused preparation cannot retain a candidate after %s',
  async (mode) => {
    const f = await tableRoundControllerFixture(true);
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
    const pending = f.actor.prepare('en');
    const rejected = expect(pending).rejects.toThrow();
    await entered.promise;
    if (mode === 'dismiss') f.actor.invalidateReview();
    if (mode === 'dispose') f.actor.dispose();
    if (mode === 'owner') await f.sessions.logout();
    if (mode === 'tenant') f.boundary.clear();
    release.resolve();
    await rejected;
    await expect(Promise.resolve().then(() => f.actor.confirm(tenantB, 'en'))).rejects.toThrow();
    expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/submit'))).toBe(false);
  },
);
it('a caller cannot modify the privately retained quote through the public review snapshot', async () => {
  const f = await tableRoundControllerFixture();
  const review = await f.actor.prepare('en');
  review.quote.currency = 'EUR';
  review.quote.money.total = 1;
  expect((await f.actor.confirm(review.operationId, 'en'))?.outcome).toBe('Applied');
});
it('a stale stop or dismissal ID cannot act on the current original round', async () => {
  const f = await tableRoundControllerFixture();
  await f.install();
  await expect(f.actor.cancelAttempt(tenantA, 'en')).rejects.toThrow();
  await expect(f.actor.acknowledge(tenantA)).rejects.toThrow();
  expect((await f.actor.saved())?.operationId).toBe(tenantB);
  expect(f.fetcher).not.toHaveBeenCalled();
});
it('a late accepted response after disposal cannot publish but preserves original recovery custody', async () => {
  const f = await tableRoundControllerFixture();
  const review = await f.actor.prepare('en');
  const entered = deferred<void>();
  const release = deferred<Response>();
  const normal = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation(async (url, options) => {
    if (url.endsWith('/submit')) {
      entered.resolve();
      return release.promise;
    }
    return normal(url, options);
  });
  const pending = f.actor.confirm(review.operationId, 'en');
  const rejected = expect(pending).rejects.toThrow();
  await entered.promise;
  f.actor.dispose();
  release.resolve(
    response({
      success: true,
      data: {
        schemaVersion: 1,
        operationId: tenantB,
        serviceSessionId: tenantA,
        outcome: 'Applied',
        orderId: tenantB,
      },
    }),
  );
  await rejected;
  expect((await f.actorFactory().saved())?.outcome).toBe('Pending');
});
