import { tablePlanFixture } from '../test/tablePlanRepository';
import { payableTableAccount } from '../test/tableContributionReview';
import { contributionBootstrap } from '../test/tablePayment';
import { bootstrapSchema } from '../core/capabilities';
import { tablePlanReview } from './tablePlanReview';
import { tablePlanSelection } from '../domain/tablePlanSelection';
import { paymentReadSession } from '../test/tablePaymentAccount';
async function fixture() {
  const f = await tablePlanFixture();
  const account = payableTableAccount();
  account.account.activeEqualSharePlan = null;
  const input = {
    ...f.preparation,
    visit: f.preparation.visit,
    account,
    bootstrap: bootstrapSchema.parse(contributionBootstrap()),
    operationId: f.prepared.proof.operationId,
    choice: {
      shareCount: 3,
      customAmountsMinor: [] as number[],
      supersedesPlanId: null as string | null,
    },
  };
  return { ...f, input, review: () => tablePlanReview(f.context, input) };
}
it('binds reviewed available fourteen CHF independently of server response money and scope', async () => {
  const f = await fixture();
  expect(f.review().accept(f.prepared).sharesMinor).toEqual([465, 465, 470]);
  expect(() =>
    f.review().accept({
      ...f.prepared,
      scope: f.prepared.scope.map((row) => ({ ...row, startOrdinal: 2 })),
    }),
  ).toThrow();
  expect(() =>
    f.review().accept({
      ...f.prepared,
      totalMinor: 1500,
      sharesMinor: [500, 500, 500],
      scope: f.prepared.scope.map((row) => ({ ...row, minorPerUnit: 750, amountMinor: 1500 })),
    }),
  ).toThrow();
});
it.each([
  'maximum-shares',
  'minimum',
  'maximum',
  'no-online',
  'available-total',
  'custom-total',
  'supersession',
])('refuses invalid current split %s', async (mode) => {
  const f = await fixture();
  const a = f.input.account.account;
  if (mode === 'maximum-shares') a.limits.maximumEqualShares = 2;
  if (mode === 'minimum') a.limits.online!.minimumAmountMinor = 500;
  if (mode === 'maximum') a.limits.online!.maximumAmountMinor = 469;
  if (mode === 'no-online') a.limits.online = null;
  if (mode === 'available-total') a.availableMinor = 1300;
  if (mode === 'custom-total') f.input.choice.customAmountsMinor = [400, 400, 400];
  if (mode === 'supersession') f.input.choice.supersedesPlanId = paymentReadSession;
  expect(f.review).toThrow();
});
it.each(['foreign', 'protected', 'missing-explicit'])(
  'requires exact original unprotected plan supersession: %s',
  async (mode) => {
    const f = await fixture();
    const plan = payableTableAccount().account.activeEqualSharePlan!;
    plan.isOwnPlan = true;
    f.input.account.account.activeEqualSharePlan = plan;
    f.input.choice.supersedesPlanId = plan.planId;
    expect(f.review().accept(f.prepared).totalMinor).toBe(1400);
    if (mode === 'foreign') plan.isOwnPlan = false;
    if (mode === 'protected') {
      plan.slots[0]!.claimState = 'Processing';
      plan.slots[0]!.isAvailable = false;
    }
    if (mode === 'missing-explicit') f.input.choice.supersedesPlanId = null;
    expect(f.review).toThrow();
  },
);
it('custom allocation order is exact and positive online bounds apply to every guest', async () => {
  const f = await fixture();
  f.input.choice = { shareCount: 2, customAmountsMinor: [400, 1000], supersedesPlanId: null };
  const selected = tablePlanSelection(f.input.account, f.input.operationId, f.input.choice);
  expect(selected.intent.customAmountsMinor).toEqual([400, 1000]);
  f.input.account.account.limits.online!.maximumAmountMinor = 999;
  expect(f.review).toThrow();
});

it('replaces an owned unclaimed stale scope after an unrelated payment consumed part of the old split', async () => {
  const f = await fixture();
  const prior = payableTableAccount().account.activeEqualSharePlan!;
  prior.isOwnPlan = true;
  prior.slots.forEach((slot) => {
    slot.isAvailable = false;
    slot.claimState = null;
  });
  const account = f.input.account.account;
  account.accountRevision = 8;
  account.outstandingMinor = 700;
  account.availableMinor = 700;
  account.capturedAccountPaymentMinor = 700;
  account.outstandingAllocations = [
    { ...account.outstandingAllocations[0]!, startOrdinal: 2, unitCount: 1, amountMinor: 700 },
  ];
  account.availableAllocations = account.outstandingAllocations.map((row) => ({ ...row }));
  account.activeEqualSharePlan = prior;
  f.input.choice.supersedesPlanId = prior.planId;
  const review = f.review();
  const prepared = {
    ...f.prepared,
    accountRevision: 8,
    totalMinor: 700,
    scope: account.availableAllocations,
    sharesMinor: [230, 230, 240],
  };
  expect(review.accept(prepared).sharesMinor).toEqual([230, 230, 240]);
});
it.each(['Quoted', 'Released', 'Failed'] as const)(
  'permits explicit replacement of an owned plan with only unprotected %s claims',
  async (state) => {
    const f = await fixture();
    const plan = payableTableAccount().account.activeEqualSharePlan!;
    plan.isOwnPlan = true;
    plan.slots.forEach((slot) => {
      slot.claimState = state;
      slot.isAvailable = false;
    });
    f.input.account.account.activeEqualSharePlan = plan;
    f.input.choice.supersedesPlanId = plan.planId;
    expect(f.review().accept(f.prepared).totalMinor).toBe(1400);
  },
);
