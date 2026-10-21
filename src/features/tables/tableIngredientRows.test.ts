import { tableItem } from '../../test/tableAccount';
import { tableIngredientRows } from './tableIngredientRows';
it('preserves duplicate frozen ingredients and keeps distinct row keys stable through reordering', () => {
  const item = tableItem();
  const sauce = item.ingredientCustomizations[0]!;
  const onion = { name: 'Onion', quantity: 0, removed: true, addOn: false };
  item.ingredientCustomizations = [sauce, onion, { ...sauce }];
  const original = tableIngredientRows(item);
  expect(original.map((row) => row.ingredient)).toEqual([sauce, onion, sauce]);
  expect(new Set(original.map((row) => row.key)).size).toBe(3);
  item.ingredientCustomizations = [onion, sauce, { ...sauce }];
  const reordered = tableIngredientRows(item);
  expect(reordered[0]!.key).toBe(original[1]!.key);
  expect(reordered[1]!.key).toBe(original[0]!.key);
  expect(reordered[2]!.key).toBe(original[2]!.key);
});
