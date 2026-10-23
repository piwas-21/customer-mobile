import { tableContributionShare } from './tableContributionShare';
import { z } from 'zod';
import {
  tablePaymentAccountSchema,
  type TablePaymentAccount,
} from '../api/tablePaymentAccountContract';
import { tablePaymentIntentSchema, tablePaymentUnitSchema } from '../api/tablePaymentIntent';
import { canonicalUuidSchema } from '../core/identifiers';
import { tablePaymentMinor } from './tablePaymentMoney';
import { TableAllocationIndex, type TableAllocation } from './tableAllocationIndex';
import { ApiFailure } from '../core/apiFailure';
const share = { planId: canonicalUuidSchema, ordinal: z.int32().min(1) };
export const tableContributionChoiceSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('Full') }),
  z.strictObject({ mode: z.literal('Amount'), amountMinor: tablePaymentMinor.min(1) }),
  z.strictObject({
    mode: z.literal('Items'),
    selectedUnits: z.array(tablePaymentUnitSchema).min(1).max(1_000),
  }),
  z.strictObject({ mode: z.literal('Equal'), ...share }),
  z.strictObject({ mode: z.literal('CustomAmount'), ...share }),
]);
export type TableContributionChoice = z.infer<typeof tableContributionChoiceSchema>;
export function tableContributionSelection(
  input: TablePaymentAccount,
  operationId: string,
  value: unknown,
) {
  const snapshot = tablePaymentAccountSchema.parse(input);
  const account = snapshot.account;
  const choice = tableContributionChoiceSchema.parse(value);
  const available = new TableAllocationIndex(account.availableAllocations);
  const online = account.limits.online;
  if (!online || available.total !== BigInt(account.availableMinor))
    throw new ApiFailure(409, 'refused');
  const fields = {
    amountMinor: null as number | null,
    equalSharePlanId: null as string | null,
    equalShareOrdinal: null as number | null,
    customSharePlanId: null as string | null,
    customShareOrdinal: null as number | null,
  };
  // The intent schema owns field exclusivity; no price is sent as authority for item/full/share modes.
  let amount = BigInt(account.availableMinor);
  let shareScope: TableAllocationIndex | undefined;
  let selectedUnits: z.infer<typeof tablePaymentUnitSchema>[] = [];
  if (choice.mode === 'Amount') {
    fields.amountMinor = choice.amountMinor;
    amount = BigInt(choice.amountMinor);
  }
  if (choice.mode === 'Items') {
    selectedUnits = choice.selectedUnits;
    if (selectedUnits.length > account.limits.maximumSelectedUnits)
      throw new ApiFailure(409, 'refused');
    amount = selectedUnits.reduce((sum, unit) => {
      const row = available.at(unit);
      if (!row) throw new ApiFailure(409, 'refused');
      return sum + BigInt(row.minorPerUnit);
    }, 0n);
  }
  if (choice.mode === 'Equal' || choice.mode === 'CustomAmount') {
    const plan = account.activeEqualSharePlan;
    const slot = plan?.slots.find((row) => row.ordinal === choice.ordinal);
    if (
      !plan ||
      plan.planId !== choice.planId ||
      plan.isCustom !== (choice.mode === 'CustomAmount') ||
      plan.shareCount > account.limits.maximumEqualShares ||
      !slot?.isAvailable
    )
      throw new ApiFailure(409, 'refused');
    amount = BigInt(slot.amountMinor);
    shareScope = tableContributionShare(plan, choice.ordinal);
    if (choice.mode === 'Equal') {
      fields.equalSharePlanId = choice.planId;
      fields.equalShareOrdinal = choice.ordinal;
    } else {
      fields.customSharePlanId = choice.planId;
      fields.customShareOrdinal = choice.ordinal;
    }
  }
  if (
    amount < BigInt(online.minimumAmountMinor) ||
    amount > BigInt(online.maximumAmountMinor) ||
    amount > available.total ||
    amount > BigInt(Number.MAX_SAFE_INTEGER)
  )
    throw new ApiFailure(409, 'refused');
  const intent = tablePaymentIntentSchema.parse({
    schemaVersion: 1,
    tenantId: snapshot.tenantId,
    serviceSessionId: account.serviceSessionId,
    expectedAccountRevision: account.accountRevision,
    operationId,
    mode: choice.mode,
    ...fields,
    selectedUnits,
  });
  return {
    intent,
    amountMinor: Number(amount),
    currency: account.currency,
    requireAllocations(rows: readonly TableAllocation[]) {
      const quote = new TableAllocationIndex(rows);
      if (
        quote.total !== amount ||
        rows.some((row) => !available.allows(row) || (shareScope && !shareScope.allows(row)))
      )
        throw new ApiFailure(200, 'contract');
    },
  };
}
