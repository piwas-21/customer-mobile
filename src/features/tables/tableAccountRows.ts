import type { TableAccount } from '../../api/tableAccountContract';
import type { TableAccountItem } from '../../api/tableAccountItem';
const MAX_VISIBLE_ACCOUNT_ROWS = 5000;
export type TableAccountRow =
  | { key: string; kind: 'order'; order: TableAccount['orders'][number] }
  | { key: string; kind: 'item'; item: TableAccountItem; depth: number };
export function tableAccountRows(account: TableAccount): TableAccountRow[] {
  if (account.orders.length + account.items.length > MAX_VISIBLE_ACCOUNT_ROWS)
    throw new Error('Table display budget exceeded');
  const groups = new Map<string, TableAccount['items']>();
  for (const line of account.items) {
    const group = groups.get(line.orderId) ?? [];
    group.push(line);
    groups.set(line.orderId, group);
  }
  const rows: TableAccountRow[] = [];
  const append = (row: TableAccountRow) => {
    if (rows.length === MAX_VISIBLE_ACCOUNT_ROWS) throw new Error('Table display budget exceeded');
    rows.push(row);
  };
  for (const order of account.orders) {
    append({ key: order.orderId, kind: 'order', order });
    for (const line of groups.get(order.orderId) ?? []) {
      const stack = [{ item: line.item, depth: 0, key: order.orderId + '/' + line.item.itemId }];
      while (stack.length) {
        const current = stack.pop()!;
        append({ ...current, kind: 'item' });
        if (current.item.sideItems.length + stack.length > MAX_VISIBLE_ACCOUNT_ROWS - rows.length)
          throw new Error('Table display budget exceeded');
        for (let index = current.item.sideItems.length - 1; index >= 0; index--) {
          const child = current.item.sideItems[index]!;
          stack.push({
            item: child,
            depth: current.depth + 1,
            key: current.key + '/' + index + ':' + child.itemId,
          });
        }
      }
    }
  }
  return rows;
}
