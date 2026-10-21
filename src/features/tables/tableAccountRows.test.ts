import { tableAccountRows } from './tableAccountRows';
import { tableAccount, tableItem } from '../../test/tableAccount';
it('keeps server order and frozen item values while producing stable distinct nested display keys', () => {
  const account = tableAccount();
  account.items[0]!.item.sideItems = [tableItem(), tableItem()];
  const rows = tableAccountRows(account);
  expect(rows.map((row) => row.kind)).toEqual(['order', 'item', 'item', 'item']);
  expect(new Set(rows.map((row) => row.key)).size).toBe(4);
  expect(rows[1]).toMatchObject({
    depth: 0,
    item: { quantity: 3, unitPrice: 3.33, itemTotal: 10 },
  });
  expect(rows.slice(2).map((row) => (row.kind === 'item' ? row.depth : null))).toEqual([1, 1]);
});
it('refuses a bill whose display exceeds the native row budget instead of silently omitting charges', () => {
  const account = tableAccount();
  account.items[0]!.item.sideItems = Array.from({ length: 5000 }, () => tableItem());
  expect(() => tableAccountRows(account)).toThrow('Table display budget exceeded');
});

it('accepts all five thousand display rows at the exact native boundary', () => {
  const account = tableAccount();
  account.items[0]!.item.sideItems = Array.from({ length: 4998 }, () => tableItem());
  expect(tableAccountRows(account)).toHaveLength(5000);
});
