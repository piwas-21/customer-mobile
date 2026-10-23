import { bootstrapSchema } from '../core/capabilities';
import { tableContributionReview } from './tableContributionReview';
import { tableContributionFixture } from '../test/tablePaymentRepository';
import { payableTableAccount } from '../test/tableContributionReview';
import { contributionBootstrap, preparedContribution } from '../test/tablePayment';
import { paymentReadSession } from '../test/tablePaymentAccount';
import { tenantA, tenantB } from '../test/fixtures';
async function fixture() {
  const f = await tableContributionFixture();
  return {
    ...f,
    input: {
      principal: f.principal,
      sessionId: f.preparation.sessionId,
      visit: f.preparation.visit,
      account: payableTableAccount(),
      bootstrap: bootstrapSchema.parse(contributionBootstrap()),
      operationId: tenantB,
      choice: { mode: 'Full' },
    },
  };
}
it('binds original scope and frozen review without putting a price in Full intent', async () => {
  const f = await fixture();
  const review = tableContributionReview(f.context, f.input);
  expect(review.preparation.intent.amountMinor).toBeNull();
  expect(review.amountMinor).toBe(1400);
  expect(review.accept(preparedContribution())).toEqual(preparedContribution());
});
it.each([
  'tenant',
  'visit',
  'currency',
  'revision',
  'unavailable-unit',
  'duplicate-unit',
  'overpriced-unit',
])('rejects a substituted reviewed allocation or identity: %s', (changed) => {
  return fixture().then((f) => {
    const review = tableContributionReview(f.context, f.input);
    const response = preparedContribution();
    if (changed === 'tenant') response.proof.tenantId = tenantB;
    if (changed === 'visit') response.serviceSessionId = tenantB;
    if (changed === 'currency') Object.assign(response, { currency: 'EUR' });
    if (changed === 'revision') response.accountRevision = 8;
    if (changed === 'unavailable-unit') response.allocations[0]!.orderId = tenantA;
    if (changed === 'duplicate-unit')
      response.allocations = [
        { ...response.allocations[0]!, unitCount: 1, amountMinor: 700 },
        { ...response.allocations[0]!, unitCount: 1, amountMinor: 700 },
      ];
    if (changed === 'overpriced-unit')
      Object.assign(response.allocations[0]!, { unitCount: 1, minorPerUnit: 1400 });
    expect(() => review.accept(response)).toThrow();
  });
});
it('accepts independent partial Amount and existing custom-share evidence within frozen available ranges', async () => {
  const f = await fixture();
  for (const [choice, amount] of [
    [{ mode: 'Amount', amountMinor: 350 }, 350],
    [{ mode: 'CustomAmount', planId: paymentReadSession, ordinal: 2 }, 400],
  ] as const) {
    const review = tableContributionReview(f.context, {
      ...f.input,
      account: payableTableAccount(choice.mode === 'CustomAmount'),
      choice,
    });
    const response = {
      ...preparedContribution(),
      mode: choice.mode,
      amountMinor: amount,
      allocations: [
        {
          ...preparedContribution().allocations[0]!,
          startOrdinal: 2,
          unitCount: 1,
          minorPerUnit: amount,
          amountMinor: amount,
        },
      ],
    };
    expect(review.accept(response)).toEqual(response);
  }
});
it.each([
  'capability',
  'table-flag',
  'guest-payment-flag',
  'account-payment-flag',
  'foreign-tenant',
  'currency',
])('refuses preparation after current %s withdrawal', async (changed) => {
  const f = await fixture();
  if (changed === 'capability') f.input.bootstrap.capabilities['table-payments'] = 'unknown';
  if (changed === 'table-flag') f.input.bootstrap.flags.tableGuestVisitsV1 = false;
  if (changed === 'guest-payment-flag') f.input.bootstrap.flags.tableGuestAccountPaymentsV1 = false;
  if (changed === 'account-payment-flag') f.input.bootstrap.flags.tableAccountPaymentsV1 = false;
  if (changed === 'foreign-tenant') f.input.account.tenantId = tenantB;
  if (changed === 'currency')
    Object.assign(f.input.account.account, {
      currency: 'EUR',
      limits: {
        ...f.input.account.account.limits,
        online: { currency: 'EUR', minimumAmountMinor: 50, maximumAmountMinor: 5000 },
      },
    });
  expect(() => tableContributionReview(f.context, f.input)).toThrow();
});
it('withdraws volatile review at exact participant expiry independently of directory validity', async () => {
  const f = await fixture();
  f.input.visit.identity.expiresAt = new Date(Date.now() + 10_000).toISOString();
  const review = tableContributionReview(f.context, f.input);
  const clock = jest
    .spyOn(Date, 'now')
    .mockReturnValue(Date.parse(f.input.visit.identity.expiresAt));
  try {
    expect(() => review.accept(preparedContribution())).toThrow();
    expect(() => f.boundary.assertCurrent(f.context)).not.toThrow();
  } finally {
    clock.mockRestore();
  }
});
