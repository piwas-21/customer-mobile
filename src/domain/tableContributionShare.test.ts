import { tableContributionSelection } from './tableContributionSelection';
import { payableTableAccount } from '../test/tableContributionReview';
import { paymentReadSession } from '../test/tablePaymentAccount';
import { tenantB } from '../test/fixtures';
it.each(['Equal', 'CustomAmount'] as const)(
  'rejects a same-total allocation from another %s share',
  (mode) => {
    const account = payableTableAccount(mode === 'CustomAmount');
    const chosen = tableContributionSelection(account, tenantB, {
      mode,
      planId: paymentReadSession,
      ordinal: 2,
    });
    const row = account.account.availableAllocations[0]!;
    const minor = mode === 'Equal' ? 700 : 400;
    const correct = [
      { ...row, startOrdinal: 2, unitCount: 1, minorPerUnit: minor, amountMinor: minor },
    ];
    expect(() => chosen.requireAllocations(correct)).not.toThrow();
    expect(() => chosen.requireAllocations([{ ...correct[0]!, startOrdinal: 1 }])).toThrow();
  },
);
it('binds a custom share spanning partial first and last units without unit expansion', () => {
  const account = payableTableAccount(true);
  const plan = account.account.activeEqualSharePlan!;
  plan.customAmountsMinor = [300, 1100];
  plan.slots[0]!.amountMinor = 300;
  plan.slots[1]!.amountMinor = 1100;
  const chosen = tableContributionSelection(account, tenantB, {
    mode: 'CustomAmount',
    planId: paymentReadSession,
    ordinal: 2,
  });
  const row = plan.scope[0]!;
  expect(() =>
    chosen.requireAllocations([
      { ...row, unitCount: 1, minorPerUnit: 400, amountMinor: 400 },
      { ...row, startOrdinal: 2, unitCount: 1, amountMinor: 700 },
    ]),
  ).not.toThrow();
  expect(() =>
    chosen.requireAllocations([
      { ...row, unitCount: 1, amountMinor: 700 },
      { ...row, startOrdinal: 2, unitCount: 1, minorPerUnit: 400, amountMinor: 400 },
    ]),
  ).toThrow();
});
it.each(['total', 'slot', 'custom', 'scope-order'])(
  'rejects inconsistent frozen share evidence: %s',
  (changed) => {
    const input = payableTableAccount(changed === 'custom');
    const plan = input.account.activeEqualSharePlan!;
    if (changed === 'total') plan.totalMinor = 1401;
    if (changed === 'slot') {
      plan.slots[0]!.amountMinor = 701;
      plan.slots[1]!.amountMinor = 699;
    }
    if (changed === 'custom') plan.customAmountsMinor = [999, 401];
    if (changed === 'scope-order') plan.scope[0]!.amountMinor = 1401;
    expect(() =>
      tableContributionSelection(input, tenantB, {
        mode: plan.isCustom ? 'CustomAmount' : 'Equal',
        planId: paymentReadSession,
        ordinal: 2,
      }),
    ).toThrow();
  },
);

it('preserves an existing 101-share plan while new creation remains capped at one hundred', () => {
  const account = payableTableAccount(false);
  const plan = account.account.activeEqualSharePlan!;
  account.account.limits.maximumEqualShares = 1_000;
  plan.shareCount = 101;
  plan.slots = Array.from({ length: 101 }, (_, index) => ({
    ...plan.slots[0]!,
    ordinal: index + 1,
    amountMinor: index === 100 ? 400 : 10,
  }));
  const chosen = tableContributionSelection(account, tenantB, {
    mode: 'Equal',
    planId: paymentReadSession,
    ordinal: 101,
  });
  expect(chosen.intent.equalShareOrdinal).toBe(101);
  const row = plan.scope[0]!;
  expect(() =>
    chosen.requireAllocations([
      { ...row, startOrdinal: 2, unitCount: 1, minorPerUnit: 400, amountMinor: 400 },
    ]),
  ).not.toThrow();
});
