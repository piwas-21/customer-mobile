import { tableContributionControllerFixture } from '../test/tableContributionController';
import { deferred } from '../test/deferred';
import { tenantA, tenantB } from '../test/fixtures';
import { tableContributionPath, tableContributionCheckoutPath } from './tableContributionRequest';
import { secretKey } from './credentials';
import { response } from '../test/transport';
import { payableTableAccount } from '../test/tableContributionReview';
it.each(['dismiss', 'dispose', 'owner', 'tenant'])(
  'withdraws paused preparation after %s without financial submission',
  async (mode) => {
    const f = await tableContributionControllerFixture(true);
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
    const pending = f.actor.prepare({ mode: 'Full' }, 'en');
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
it('confirms against a fresh account and consumes a changed review without installing custody', async () => {
  const f = await tableContributionControllerFixture();
  const review = await f.actor.prepare({ mode: 'Full' }, 'en');
  const normal = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation(async (url, options) => {
    if (new URL(url).pathname === tableContributionPath + '/account') {
      const account = payableTableAccount();
      account.account.availableMinor = 0;
      account.account.availableAllocations = [];
      return response({ success: true, data: account });
    }
    return normal(url, options);
  });
  await expect(f.actor.confirm(review.operationId, 'en')).rejects.toThrow();
  expect(await f.actor.saved()).toBeNull();
  expect(f.paths().some((path) => path.endsWith('/submit'))).toBe(false);
  await expect(f.actor.confirm(review.operationId, 'en')).rejects.toThrow();
});
it.each(['dispose', 'owner', 'tenant'])(
  'a browser returning after %s cannot publish or dispatch another financial request',
  async (mode) => {
    const f = await tableContributionControllerFixture(true);
    const entered = deferred<void>();
    const release = deferred<void>();
    f.openBrowser.mockImplementation(async () => {
      entered.resolve();
      await release.promise;
    });
    const review = await f.actor.prepare({ mode: 'Full' }, 'en');
    const pending = f.actor.confirm(review.operationId, 'en');
    const rejected = expect(pending).rejects.toThrow();
    await entered.promise;
    if (mode === 'dispose') f.actor.dispose();
    if (mode === 'owner') await f.sessions.logout();
    if (mode === 'tenant') f.boundary.clear();
    const before = f.fetcher.mock.calls.length;
    release.resolve();
    await rejected;
    expect(f.fetcher).toHaveBeenCalledTimes(before);
    const retained = JSON.parse(
      f.store.values.get(secretKey(f.context, 'table-payment-operation', f.principal))!,
    ) as { proof: { operationId: string }; checkout: { outcome: string } };
    expect(retained?.proof.operationId).toBe(review.operationId);
    expect(retained?.checkout?.outcome).toBe('pending');
  },
);
it('browser failure still reads canonical capture before exposing paid state', async () => {
  const f = await tableContributionControllerFixture();
  const review = await f.actor.prepare({ mode: 'Full' }, 'en');
  f.openBrowser.mockImplementation(async () => {
    f.state.paid = true;
    throw new Error('Browser interrupted');
  });
  await expect(f.actor.confirm(review.operationId, 'en')).rejects.toThrow('Browser interrupted');
  expect((await f.actor.saved())?.state).toBe('paid');
  expect(
    f.paths().filter((path) => path === tableContributionCheckoutPath + '/recover'),
  ).toHaveLength(1);
});
it('coalesces double confirmation and refuses competing stopping while the original submit is pending', async () => {
  const f = await tableContributionControllerFixture();
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
  const review = await f.actor.prepare({ mode: 'Full' }, 'en');
  const pending = f.actor.confirm(review.operationId, 'en');
  await entered.promise;
  expect(f.actor.confirm(review.operationId, 'en')).toBe(pending);
  expect(() => f.actor.stop(review.operationId, 'en')).toThrow();
  release.resolve();
  expect((await pending)?.state).toBe('pending');
  expect(f.paths().filter((path) => path === tableContributionPath + '/submit')).toHaveLength(1);
});
it('refuses a stale stop or acknowledgement without changing original custody', async () => {
  const f = await tableContributionControllerFixture();
  await f.install();
  await expect(f.actor.stop(tenantA, 'en')).rejects.toThrow();
  await expect(f.actor.acknowledge(tenantA)).rejects.toThrow();
  expect((await f.actor.saved())?.operationId).toBe(tenantB);
  expect(f.fetcher).not.toHaveBeenCalled();
});
