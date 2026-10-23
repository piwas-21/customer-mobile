import { tablePaymentAccount } from './tablePaymentAccount';
export function payableTableAccount(custom = false) {
  const value = tablePaymentAccount();
  const account = value.account;
  account.availableMinor = 1400;
  account.reservedMinor = 0;
  account.activeAttempts = [];
  account.availableAllocations = account.outstandingAllocations.map((row) => ({ ...row }));
  account.limits.online = { currency: 'CHF', minimumAmountMinor: 50, maximumAmountMinor: 5_000 };
  const plan = account.activeEqualSharePlan;
  if (!plan) throw new Error('Independent share fixture missing');
  plan.isCustom = custom;
  plan.customAmountsMinor = custom ? [1000, 400] : null;
  plan.slots = [
    { ordinal: 1, amountMinor: custom ? 1000 : 700, claimState: null, isAvailable: true },
    { ordinal: 2, amountMinor: custom ? 400 : 700, claimState: null, isAvailable: true },
  ];
  return value;
}
