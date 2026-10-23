import { tableContributionSelection } from './tableContributionSelection';
import { payableTableAccount } from '../test/tableContributionReview';
import { paymentReadSession } from '../test/tablePaymentAccount';
import { tenantA, tenantB } from '../test/fixtures';
const unit = { orderId: tenantB, orderItemId: paymentReadSession, ordinal: 2 };
it.each([
  [{ mode: 'Full' }, 1400],
  [{ mode: 'Amount', amountMinor: 350 }, 350],
  [{ mode: 'Items', selectedUnits: [unit] }, 700],
  [{ mode: 'Equal', planId: paymentReadSession, ordinal: 2 }, 700],
  [{ mode: 'CustomAmount', planId: paymentReadSession, ordinal: 2 }, 400],
])('reviews the independent mode %j with exact CHF amount %s', (choice, expected) => {
  const reviewed = tableContributionSelection(
    payableTableAccount(choice.mode === 'CustomAmount'),
    tenantB,
    choice,
  );
  expect(reviewed.amountMinor).toBe(expected);
  expect(reviewed.intent.expectedAccountRevision).toBe(7);
  expect(reviewed.intent.operationId).toBe(tenantB);
  expect(reviewed.intent.amountMinor).toBe(choice.mode === 'Amount' ? 350 : null);
  expect(reviewed.currency).toBe('CHF');
});
it.each([
  { mode: 'Amount', amountMinor: 49 },
  { mode: 'Amount', amountMinor: 1401 },
  { mode: 'Items', selectedUnits: [unit, unit] },
  { mode: 'Items', selectedUnits: [{ ...unit, ordinal: 3 }] },
  { mode: 'Items', selectedUnits: [{ ...unit, orderId: tenantA }] },
  { mode: 'Items', selectedUnits: [{ ...unit, orderItemId: null }] },
  { mode: 'Equal', planId: tenantA, ordinal: 2 },
  { mode: 'Equal', planId: paymentReadSession, ordinal: 3 },
  { mode: 'CustomAmount', planId: paymentReadSession, ordinal: 2 },
  { mode: 'Full', amountMinor: 1400 },
])('refuses unavailable or ambiguous selection %j', (choice) => {
  expect(() => tableContributionSelection(payableTableAccount(), tenantB, choice)).toThrow();
});
it.each([
  'online',
  'maximum',
  'selected-limit',
  'share-claim',
  'share-limit',
  'available-total',
  'overlap',
  'product',
])('refuses changed current payment limits or inconsistent debt: %s', (changed) => {
  const input = payableTableAccount();
  const account = input.account;
  let choice: unknown = { mode: 'Full' };
  if (changed === 'online') account.limits.online = null;
  if (changed === 'maximum') account.limits.online!.maximumAmountMinor = 1399;
  if (changed === 'selected-limit') {
    account.limits.maximumSelectedUnits = 1;
    choice = { mode: 'Items', selectedUnits: [unit, { ...unit, ordinal: 1 }] };
  }
  if (changed === 'share-claim') {
    account.activeEqualSharePlan!.slots[1]!.isAvailable = false;
    choice = { mode: 'Equal', planId: paymentReadSession, ordinal: 2 };
  }
  if (changed === 'share-limit') {
    account.limits.maximumEqualShares = 1;
    choice = { mode: 'Equal', planId: paymentReadSession, ordinal: 2 };
  }
  if (changed === 'available-total') account.availableMinor = 1399;
  if (changed === 'overlap') {
    account.availableAllocations.push({ ...account.availableAllocations[0]! });
    account.availableMinor = 2800;
  }
  if (changed === 'product') account.availableAllocations[0]!.amountMinor = 1399;
  expect(() => tableContributionSelection(input, tenantB, choice)).toThrow();
});
it('handles a billion units as bounded ranges with exact one-cent money without expansion', () => {
  const input = payableTableAccount();
  const row = input.account.availableAllocations[0]!;
  Object.assign(row, { unitCount: 1_000_000_000, minorPerUnit: 1, amountMinor: 1_000_000_000 });
  input.account.availableMinor = 1_000_000_000;
  input.account.limits.online!.minimumAmountMinor = 1;
  const selected = tableContributionSelection(input, tenantB, {
    mode: 'Items',
    selectedUnits: [{ ...unit, ordinal: 1_000_000_000 }],
  });
  expect(selected.amountMinor).toBe(1);
});
