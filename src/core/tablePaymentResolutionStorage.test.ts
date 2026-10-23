import { tableContributionFixture } from '../test/tablePaymentRepository';
import { roundGuard } from '../test/tableRoundRepository';
import {
  contributionResolution,
  contributionCheckout,
  contributionCheckoutUrl,
} from '../test/tablePayment';
import { TablePaymentStorage } from './tablePaymentStorage';
it('unseen recovery and accepted reservation retain the hold and never imply paid', async () => {
  const f = await tableContributionFixture();
  const record = await f.install();
  const unseen = { ...contributionResolution(), outcome: 'Unseen', attemptId: null, state: null };
  expect(
    await f.repository.tablePayments.finishResolution(f.context, record, unseen, roundGuard),
  ).toEqual(record);
  await expect(
    f.repository.tablePayments.acknowledge(f.context, record, roundGuard),
  ).rejects.toThrow();
  const reserved = await f.repository.tablePayments.finishResolution(
    f.context,
    record,
    contributionResolution(),
    roundGuard,
  );
  expect(reserved.resolution?.outcome).toBe('Applied');
  expect(reserved.checkout).toBeNull();
  await expect(
    new TablePaymentStorage(f.store).assertResolved(f.context, f.principal, roundGuard),
  ).rejects.toThrow();
});
it('persists canonical pending evidence before browser use while keeping the hosted URL volatile', async () => {
  const f = await tableContributionFixture();
  const installed = await f.install();
  const record = await f.repository.tablePayments.finishResolution(
    f.context,
    installed,
    contributionResolution(),
    roundGuard,
  );
  const saved = await f.repository.tablePayments.finishCheckout(
    f.context,
    record,
    {
      ...contributionCheckout(),
      outcome: 'ready',
      checkoutUrl: contributionCheckoutUrl(),
    },
    roundGuard,
  );
  expect(saved.checkout).toEqual({ outcome: 'pending', expiresAt: '2035-01-01T00:00:00Z' });
  expect([...f.store.values.values()].join()).not.toContain(contributionCheckoutUrl());
  await expect(
    f.repository.tablePayments.acknowledge(f.context, saved, roundGuard),
  ).rejects.toThrow();
});
