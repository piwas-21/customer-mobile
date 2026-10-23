import { z } from 'zod';
import { tablePlanIntentSchema } from '../api/tablePlanIntent';
import {
  tablePaymentAccountSchema,
  type TablePaymentAccount,
} from '../api/tablePaymentAccountContract';
import { TableAllocationIndex, type TableAllocation } from './tableAllocationIndex';
import { tableShareAmounts } from './tableShareAmounts';
import { ApiFailure } from '../core/apiFailure';
const fields = tablePlanIntentSchema.shape;
export const tablePlanChoiceSchema = z.strictObject({
  shareCount: fields.shareCount,
  customAmountsMinor: fields.customAmountsMinor,
  supersedesPlanId: fields.supersedesPlanId,
});
export type TablePlanChoice = z.infer<typeof tablePlanChoiceSchema>;
export function tablePlanSelection(
  input: TablePaymentAccount,
  operationId: string,
  value: unknown,
) {
  const snapshot = tablePaymentAccountSchema.parse(input);
  const account = snapshot.account;
  const choice = tablePlanChoiceSchema.parse(value);
  const scope = new TableAllocationIndex(account.availableAllocations);
  const online = account.limits.online;
  const previous = account.activeEqualSharePlan;
  if (
    !online ||
    choice.shareCount > account.limits.maximumEqualShares ||
    scope.total <= 0n ||
    scope.total !== BigInt(account.availableMinor) ||
    online.currency !== account.currency ||
    (previous
      ? !previous.isOwnPlan ||
        previous.planId !== choice.supersedesPlanId ||
        previous.slots.some(
          (slot) =>
            slot.claimState !== null &&
            slot.claimState !== 'Quoted' &&
            slot.claimState !== 'Released' &&
            slot.claimState !== 'Failed',
        )
      : choice.supersedesPlanId !== null)
  )
    throw new ApiFailure(409, 'refused');
  const shares = tableShareAmounts(
    scope.total,
    choice.shareCount,
    account.currency,
    choice.customAmountsMinor,
  );
  if (
    shares.some(
      (amount) =>
        amount < BigInt(online.minimumAmountMinor) || amount > BigInt(online.maximumAmountMinor),
    )
  )
    throw new ApiFailure(409, 'refused');
  const intent = tablePlanIntentSchema.parse({
    schemaVersion: 1,
    tenantId: snapshot.tenantId,
    operationId,
    serviceSessionId: account.serviceSessionId,
    expectedAccountRevision: account.accountRevision,
    ...choice,
  });
  return {
    intent,
    currency: account.currency,
    totalMinor: account.availableMinor,
    requireScope(rows: readonly TableAllocation[]) {
      const received = new TableAllocationIndex(rows);
      if (received.total !== scope.total || rows.some((row) => !scope.allows(row)))
        throw new ApiFailure(200, 'contract');
    },
  };
}
