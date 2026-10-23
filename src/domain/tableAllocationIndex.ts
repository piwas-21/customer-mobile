import { z } from 'zod';
import { tablePaymentAllocationSchema } from '../api/tablePaymentAccountContract';
import type { TablePaymentIntent } from '../api/tablePaymentIntent';
import { ApiFailure } from '../core/apiFailure';
export type TableAllocation = z.infer<typeof tablePaymentAllocationSchema>;
type Unit = TablePaymentIntent['selectedUnits'][number];
const key = (value: Pick<TableAllocation, 'orderId' | 'orderItemId'>) =>
  JSON.stringify([value.orderId, value.orderItemId]);
export class TableAllocationIndex {
  private readonly groups = new Map<string, TableAllocation[]>();
  readonly total: bigint;
  constructor(input: readonly TableAllocation[]) {
    const rows = z.array(tablePaymentAllocationSchema).max(5_000).parse(input);
    this.total = rows.reduce((total, row) => total + BigInt(row.amountMinor), 0n);
    for (const row of rows) {
      if (BigInt(row.unitCount) * BigInt(row.minorPerUnit) !== BigInt(row.amountMinor))
        throw new ApiFailure(200, 'contract');
      const identity = key(row);
      const group = this.groups.get(identity) ?? [];
      group.push(row);
      this.groups.set(identity, group);
    }
    for (const group of this.groups.values()) {
      group.sort((left, right) => left.startOrdinal - right.startOrdinal);
      for (let i = 1; i < group.length; i++) {
        const previous = group[i - 1];
        const current = group[i];
        if (
          !previous ||
          !current ||
          previous.startOrdinal + previous.unitCount > current.startOrdinal
        )
          throw new ApiFailure(200, 'contract');
      }
    }
  }
  at(unit: Unit): TableAllocation | undefined {
    const rows = this.groups.get(key(unit)) ?? [];
    let low = 0;
    let high = rows.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const row = rows[middle];
      if (!row) throw new ApiFailure(200, 'contract');
      if (unit.ordinal < row.startOrdinal) high = middle - 1;
      else if (unit.ordinal >= row.startOrdinal + row.unitCount) low = middle + 1;
      else return row;
    }
    return undefined;
  }
  allows(row: TableAllocation) {
    const original = this.at({
      orderId: row.orderId,
      orderItemId: row.orderItemId,
      ordinal: row.startOrdinal,
    });
    return Boolean(
      original &&
      row.startOrdinal + row.unitCount <= original.startOrdinal + original.unitCount &&
      row.minorPerUnit <= original.minorPerUnit,
    );
  }
}
