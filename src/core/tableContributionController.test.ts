import { tableContributionControllerFixture } from '../test/tableContributionController';
import { tableContributionFixture } from '../test/tablePaymentRepository';
import { TableContributionController } from './tableContributionController';
import { contributionBootstrap, contributionResolution } from '../test/tablePayment';
import { roundGuard } from '../test/tableRoundRepository';
import { tableContributionPath, tableContributionCheckoutPath } from './tableContributionRequest';
import { paymentReadSession } from '../test/tablePaymentAccount';
import { tenantB } from '../test/fixtures';
import type { TableContributionChoice } from '../domain/tableContributionSelection';
it.each<TableContributionChoice>([
  { mode: 'Full' },
  { mode: 'Amount', amountMinor: 350 },
  {
    mode: 'Items',
    selectedUnits: [{ orderId: tenantB, orderItemId: paymentReadSession, ordinal: 2 }],
  },
  { mode: 'Equal', planId: paymentReadSession, ordinal: 2 },
  { mode: 'CustomAmount', planId: paymentReadSession, ordinal: 2 },
])('reviews and confirms one original %j without trusting browser success text', async (choice) => {
  const f = await tableContributionControllerFixture(false, choice.mode === 'CustomAmount');
  const review = await f.actor.prepare(choice, 'en');
  expect(JSON.stringify(review)).not.toMatch(/payloadHash|ownerProof|participantToken|sessionId/);
  f.openBrowser.mockImplementation(async (url) => {
    const record = await f.repository.tablePayments.load(f.context, f.principal, roundGuard);
    expect(record?.checkout?.outcome).toBe('pending');
    expect(record?.resolution?.outcome).toBe('Applied');
    expect(url).toBe(f.hostedUrl);
    expect([...f.store.values.values()].join()).not.toContain(f.hostedUrl);
    return { type: 'success', claimedPaid: true };
  });
  const result = await f.actor.confirm(review.operationId, 'en');
  expect(result?.state).toBe('pending');
  expect(f.openBrowser).toHaveBeenCalledTimes(1);
  expect(f.paths().filter((path) => path === tableContributionPath + '/submit')).toHaveLength(1);
  expect(
    f.paths().filter((path) => path === tableContributionCheckoutPath + '/start'),
  ).toHaveLength(1);
  expect(
    f.paths().filter((path) => path === tableContributionCheckoutPath + '/recover'),
  ).toHaveLength(1);
  await expect(f.actor.confirm(review.operationId, 'en')).rejects.toThrow();
  expect(f.paths().filter((path) => path === tableContributionPath + '/submit')).toHaveLength(1);
});
it('a lost submission is recovered before explicit starting of the same accepted reservation', async () => {
  const f = await tableContributionControllerFixture();
  const review = await f.actor.prepare({ mode: 'Full' }, 'en');
  const normal = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation(async (url, options) => {
    const result = await normal(url, options);
    if (new URL(url).pathname === tableContributionPath + '/submit')
      throw new Error('Lost submit response');
    return result;
  });
  await expect(f.actor.confirm(review.operationId, 'en')).rejects.toThrow();
  expect((await f.actor.saved())?.state).toBe('uncertain');
  expect(f.openBrowser).not.toHaveBeenCalled();
  expect((await f.actor.recover('en'))?.state).toBe('reserved');
  expect(f.paths().filter((path) => path === tableContributionPath + '/submit')).toHaveLength(1);
  expect(
    f.paths().filter((path) => path === tableContributionCheckoutPath + '/start'),
  ).toHaveLength(0);
  await f.actor.open('en');
  expect(f.openBrowser).toHaveBeenCalledTimes(1);
  expect(
    f.paths().filter((path) => path === tableContributionCheckoutPath + '/start'),
  ).toHaveLength(1);
});
it('lost hosted creation recovers the original journal without another start', async () => {
  const f = await tableContributionControllerFixture();
  const review = await f.actor.prepare({ mode: 'Full' }, 'en');
  const normal = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation(async (url, options) => {
    const result = await normal(url, options);
    if (new URL(url).pathname === tableContributionCheckoutPath + '/start')
      throw new Error('Lost provider response');
    return result;
  });
  await expect(f.actor.confirm(review.operationId, 'en')).rejects.toThrow();
  expect((await f.actor.recover('en'))?.canOpen).toBe(true);
  await f.actor.open('en');
  expect(f.openBrowser).toHaveBeenCalledTimes(1);
  expect(
    f.paths().filter((path) => path === tableContributionCheckoutPath + '/start'),
  ).toHaveLength(1);
});
it('unknown checkout stop retains the original hold and exposes no replacement payment', async () => {
  const f = await tableContributionControllerFixture();
  f.state.unknown = true;
  const review = await f.actor.prepare({ mode: 'Full' }, 'en');
  expect((await f.actor.confirm(review.operationId, 'en'))?.state).toBe('pending');
  expect((await f.actor.stop(review.operationId, 'en'))?.state).toBe('pending');
  expect(f.openBrowser).not.toHaveBeenCalled();
  await expect(f.actor.acknowledge(review.operationId)).rejects.toThrow();
  await expect(f.actor.prepare({ mode: 'Full' }, 'en')).rejects.toThrow();
  expect(
    (await f.repository.tablePayments.load(f.context, f.principal, roundGuard))
      ?.cancellationRequested,
  ).toBe(true);
});
it('canonical paid evidence permits acknowledged dismissal without an order identity', async () => {
  const f = await tableContributionControllerFixture();
  const review = await f.actor.prepare({ mode: 'Full' }, 'en');
  f.openBrowser.mockImplementation(async () => {
    f.state.paid = true;
    return { type: 'cancel' };
  });
  const paid = await f.actor.confirm(review.operationId, 'en');
  expect(paid?.state).toBe('paid');
  expect(JSON.stringify(paid)).not.toContain('orderId');
  expect(paid?.attemptId).toBe(contributionResolution().attemptId);
  await f.actor.acknowledge(review.operationId);
  expect(await f.actor.saved()).toBeNull();
});
it('unseen recovery keeps original custody until a canonical permanent stop', async () => {
  const f = await tableContributionControllerFixture();
  await f.install();
  expect((await f.actor.recover('en'))?.state).toBe('uncertain');
  expect((await f.actor.stop(tenantB, 'en'))?.state).toBe('stopped');
  await f.actor.acknowledge(tenantB);
  expect(await f.actor.saved()).toBeNull();
});
it('dispose withdraws private operations before any network access', async () => {
  const f = await tableContributionFixture();
  const actor = new TableContributionController(
    f.context,
    f.client,
    f.repository,
    f.sessions,
    f.principal,
    contributionBootstrap(),
    f.createId,
    [],
    async () => undefined,
  );
  actor.dispose();
  await expect(async () => actor.prepare({ mode: 'Full' }, 'en')).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
});
