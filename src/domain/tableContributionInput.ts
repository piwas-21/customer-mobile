import { z } from 'zod';
import type { TablePaymentAccount } from '../api/tablePaymentAccountContract';
import type { TablePaymentIntent } from '../api/tablePaymentIntent';
const PAGE_SIZE = 40;
// Decimal entry has no grouping or exponent; all arithmetic remains exact minor units.
export function contributionInputMinor(value: string) {
  const match = /^(0|[1-9]\d{0,13})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return undefined;
  const result = BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  return result > 0n && result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : undefined;
}
type Unit = TablePaymentIntent['selectedUnits'][number];
export const contributionUnitKey = (unit: Unit) =>
  JSON.stringify([unit.orderId, unit.orderItemId, unit.ordinal]);
export function contributionUnitPage(account: TablePaymentAccount['account'], page: number) {
  const position = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).parse(page);
  let skip = BigInt(position) * BigInt(PAGE_SIZE);
  let total = 0n;
  const units: (Unit & { amountMinor: number })[] = [];
  for (const row of account.availableAllocations) {
    if (!row.orderItemId) continue;
    total += BigInt(row.unitCount);
    if (skip >= BigInt(row.unitCount)) {
      skip -= BigInt(row.unitCount);
      continue;
    }
    for (
      let ordinal = row.startOrdinal + Number(skip);
      ordinal < row.startOrdinal + row.unitCount && units.length < PAGE_SIZE;
      ordinal++
    )
      units.push({
        orderId: row.orderId,
        orderItemId: row.orderItemId,
        ordinal,
        amountMinor: row.minorPerUnit,
      });
    skip = 0n;
  }
  return { units, previous: position > 0, next: BigInt(position + 1) * BigInt(PAGE_SIZE) < total };
}
