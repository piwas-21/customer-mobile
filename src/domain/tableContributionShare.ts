import type { TablePaymentAccount } from '../api/tablePaymentAccountContract';
import { TableAllocationIndex, type TableAllocation } from './tableAllocationIndex';
import { ApiFailure } from '../core/apiFailure';
type Plan = NonNullable<TablePaymentAccount['account']['activeEqualSharePlan']>;
export function tableContributionShare(plan: Plan, ordinal: number) {
  const reviewed = new TableAllocationIndex(plan.scope);
  const slots = [...plan.slots].sort((a, b) => a.ordinal - b.ordinal);
  const step = plan.currency === 'CHF' || plan.currency === 'EUR' ? 5n : 1n;
  const total = BigInt(plan.totalMinor);
  const count = BigInt(plan.shareCount);
  const base = (total / count / step) * step;
  if (
    reviewed.total !== total ||
    slots.reduce((sum, slot) => sum + BigInt(slot.amountMinor), 0n) !== total ||
    slots.some(
      (slot, i) =>
        BigInt(slot.amountMinor) !==
        (plan.isCustom
          ? BigInt(plan.customAmountsMinor?.[i] ?? 0)
          : step > 1n
            ? i === slots.length - 1
              ? total - base * (count - 1n)
              : base
            : total / count + (BigInt(i) < total % count ? 1n : 0n)),
    )
  )
    throw new ApiFailure(200, 'contract');
  const offset = slots
    .filter((slot) => slot.ordinal < ordinal)
    .reduce((sum, slot) => sum + BigInt(slot.amountMinor), 0n);
  const selected = slots.find((slot) => slot.ordinal === ordinal);
  if (!selected) throw new ApiFailure(409, 'refused');
  return new TableAllocationIndex(sliceScope(plan.scope, offset, BigInt(selected.amountMinor)));
}
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
      const part = left < minor - remainder ? left : minor - remainder;
      append(1, part);
      left -= part;
      unit++;
      count--;
    }
    const units = Number(left / minor < BigInt(count) ? left / minor : BigInt(count));
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
