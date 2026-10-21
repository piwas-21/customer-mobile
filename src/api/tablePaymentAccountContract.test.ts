import { tablePaymentAccountSchema } from './tablePaymentAccountContract';
import { tablePaymentAccount } from '../test/tablePaymentAccount';

it('preserves independently frozen server allocations and amounts without granting online availability', () => {
  const input = tablePaymentAccount();
  expect(tablePaymentAccountSchema.parse(input)).toEqual(input);
  expect(input.account.outstandingMinor).toBe(1400);
  expect(input.account.reservedMinor).toBe(700);
  expect(input.account.limits.online).toBeNull();
});
it.each([
  'unsafe-revision',
  'unsafe-money',
  'unknown-version',
  'currency',
  'nested-currency',
  'foreign-operation',
  'duplicate-position',
  'scope-bound',
  'attempt-bound',
  'extra-proof',
  'extra-contact',
  'unsupported-unit',
  'invalid-limits',
])('refuses unsupported or private native account data: %s', (changed) => {
  const input = tablePaymentAccount();
  const account = input.account;
  switch (changed) {
    case 'unsafe-revision':
      account.accountRevision = Number.MAX_SAFE_INTEGER + 1;
      break;
    case 'unsafe-money':
      account.availableMinor = Number.MAX_SAFE_INTEGER + 1;
      break;
    case 'unknown-version':
      account.billingAllocationVersion = 2 as 1;
      break;
    case 'currency':
      account.currency = 'JPY' as 'CHF';
      break;
    case 'nested-currency':
      account.activeAttempts[0]!.currency = 'EUR';
      break;
    case 'foreign-operation':
      account.activeAttempts[0]!.isOwnOperation = false;
      break;
    case 'duplicate-position':
      account.activeEqualSharePlan!.slots[1]!.ordinal = 1;
      break;
    case 'scope-bound':
      account.availableAllocations = Array.from(
        { length: 5001 },
        () => account.availableAllocations[0]!,
      );
      break;
    case 'attempt-bound':
      account.activeAttempts = Array.from({ length: 1001 }, () => account.activeAttempts[0]!);
      break;
    case 'extra-proof':
      Object.assign(input, { ownerProof: 'private' });
      break;
    case 'extra-contact':
      Object.assign(account, { customerEmail: 'private' });
      break;
    case 'unsupported-unit':
      account.activeEqualSharePlan!.slots[0]!.amountMinor = 0;
      break;
    case 'invalid-limits':
      account.limits.online = { currency: 'CHF', minimumAmountMinor: 100, maximumAmountMinor: 50 };
      break;
  }
  expect(tablePaymentAccountSchema.safeParse(input).success).toBe(false);
});
it('accepts a redacted foreign hold and server custom positions without inventing equal amounts', () => {
  const input = tablePaymentAccount();
  input.account.activeAttempts[0]!.operationId = null;
  input.account.activeAttempts[0]!.isOwnOperation = false;
  const plan = input.account.activeEqualSharePlan!;
  plan.isCustom = true;
  plan.customAmountsMinor = [600, 800];
  plan.slots[0]!.amountMinor = 600;
  plan.slots[1]!.amountMinor = 800;
  expect(tablePaymentAccountSchema.parse(input)).toEqual(input);
});
