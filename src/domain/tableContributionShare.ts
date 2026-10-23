import type { TablePaymentAccount } from '../api/tablePaymentAccountContract';
import { TableAllocationIndex, type TableAllocation } from './tableAllocationIndex';
import { ApiFailure } from '../core/apiFailure';
import { tableShareAmounts } from './tableShareAmounts';
type Plan = NonNullable<TablePaymentAccount['account']['activeEqualSharePlan']>;
export function tableContributionShare(plan: Plan, ordinal: number) {
  const reviewed = new TableAllocationIndex(plan.scope);
  const slots = [...plan.slots].sort((a, b) => a.ordinal - b.ordinal);
  const total = BigInt(plan.totalMinor);
  const amounts = tableShareAmounts(
    total,
    plan.shareCount,
    plan.currency,
    plan.isCustom ? (plan.customAmountsMinor ?? []) : [],
  );
  if (
    reviewed.total !== total ||
    slots.reduce((sum, slot) => sum + BigInt(slot.amountMinor), 0n) !== total ||
    (plan.isCustom && plan.customAmountsMinor?.length !== plan.shareCount) ||
    slots.length !== plan.shareCount ||
    slots.some((slot, i) => slot.ordinal !== i + 1 || BigInt(slot.amountMinor) !== amounts[i])
  )
    throw new ApiFailure(200, 'contract');
  const offset = slots
    .filter((slot) => slot.ordinal < ordinal)
    .reduce((sum, slot) => sum + BigInt(slot.amountMinor), 0n);
  const selected = slots.find((slot) => slot.ordinal === ordinal);
  if (!selected) throw new ApiFailure(409, 'refused');
  return new TableAllocationIndex(sliceScope(plan.scope, offset, BigInt(selected.amountMinor)));
}
const minimum = (a: bigint, b: bigint) => (a < b ? a : b);
// Slice frozen money in its reviewed order. At most two partial units are materialized.
function sliceScope(input: readonly TableAllocation[], offset: bigint, amount: bigint) {
  const result: TableAllocation[] = [];
  let skip = offset;
  let left = amount;
  for (const row of input) {
    if (!left) break;
    const total = BigInt(row.amountMinor);
    if (skip >= total) {
      skip -= total;
      continue;
    }
    const minor = BigInt(row.minorPerUnit);
    let unit = row.startOrdinal + Number(skip / minor);
    let count = row.unitCount - Number(skip / minor);
    const remainder = skip % minor;
    const append = (units: number, value: bigint) =>
      result.push({
        ...row,
        startOrdinal: unit,
        unitCount: units,
        minorPerUnit: Number(value),
        amountMinor: Number(BigInt(units) * value),
      });
    if (remainder) {
      const part = minimum(left, minor - remainder);
      append(1, part);
      left -= part;
      unit++;
      count--;
    }
    const units = Number(minimum(left / minor, BigInt(count)));
    if (units) {
      append(units, minor);
      left -= BigInt(units) * minor;
      unit += units;
      count -= units;
    }
    if (left && count) {
      append(1, left);
      left = 0n;
    }
    skip = 0n;
  }
  if (left || skip) throw new ApiFailure(200, 'contract');
  return result;
}
