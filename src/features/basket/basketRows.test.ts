import { basketRows } from './basketRows';
import { basketResponse } from '../../test/basketApi';
import type { BasketLine } from '../../api/basketResponse';
it('keeps nested server composition and instructions while showing amounts only on root rows', () => {
  const root: BasketLine = {
    ...basketResponse().items[0]!,
    selectedIngredientNames: ['Bread'],
    addedIngredientNames: ['Tomato'],
    specialInstructions: 'Cut in half',
    selectedSideItems: [
      {
        id: basketResponse().id,
        name: 'Drink',
        quantity: 2,
        price: 4,
        subTotal: 8,
        variationName: 'Large',
      },
    ],
    childItems: [
      {
        ...basketResponse().items[0]!,
        productName: 'Chicken',
        presentationLabel: 'Dish',
        childItems: [],
      },
    ],
  };
  const rows = basketRows([root]);
  expect(rows).toEqual([
    {
      key: '0',
      name: 'Meal',
      quantity: 2,
      amount: 14,
      description: ['Bread', 'Tomato', '2 × Drink · Large'],
      removed: ['Onion'],
      instructions: 'Cut in half',
      nested: false,
    },
    {
      key: '0.0',
      name: 'Dish · Chicken',
      quantity: 2,
      amount: null,
      description: [],
      removed: ['Onion'],
      instructions: null,
      nested: true,
    },
  ]);
  expect(root.childItems?.[0]?.itemTotal).toBe(14);
});
it('refuses unsupported depth or row counts rather than silently truncating a priced basket', () => {
  const row: BasketLine = { ...basketResponse().items[0]!, childItems: [] };
  let tree = row;
  for (let depth = 0; depth < 9; depth++) tree = { ...row, childItems: [tree] };
  expect(() => basketRows([tree])).toThrow('Unsupported');
  expect(() => basketRows(Array.from({ length: 1001 }, () => row))).toThrow('Unsupported');
  expect(basketRows(Array.from({ length: 1000 }, () => row))).toHaveLength(1000);
});
it('preserves root and child order even when server row identifiers are absent', () => {
  const root = { ...basketResponse().items[0]!, id: null };
  expect(
    basketRows([
      { ...root, productName: 'First', childItems: [{ ...root, productName: 'Inside' }] },
      { ...root, productName: 'Last' },
    ]).map(({ name, key }) => [name, key]),
  ).toEqual([
    ['First', '0'],
    ['Inside', '0.0'],
    ['Last', '1'],
  ]);
});
