import i18n from '../../i18n';
import { selectionReviewRows } from './selectionReview';
import { productFlow } from '../../domain/productFlow';
import { compositionLabels, compositionProduct } from '../../test/compositions';
import { recipeIds } from '../../test/recipes';
import { productIds } from '../../test/products';
import { tenantB } from '../../test/fixtures';
it('describes selected quantities and explicit removals without inventing price amounts', () => {
  const flow = productFlow(compositionProduct(), new Map(), 'en', compositionLabels);
  const rows = selectionReviewRows(
    flow,
    {
      ...flow.defaults,
      groups: {
        recipe: { [recipeIds.fixed]: 1, [recipeIds.included]: 0, [recipeIds.extra]: 2 },
        sauce: {},
      },
    },
    i18n.t,
  );
  expect(rows.map(({ label }) => label)).toEqual([
    'Small',
    'Bread × 1',
    'Without Salad',
    'Tomato × 2',
  ]);
  expect(new Set(rows.map(({ id }) => id)).size).toBe(rows.length);
});
it('retains optional side membership, variation and quantity and omits unselected sides', () => {
  const product = compositionProduct();
  product.suggestedSideItems = [
    {
      id: tenantB,
      suggestedSideItemId: productIds.sideLink,
      name: 'Drink',
      price: 2,
      type: 'beverage',
      isRequired: false,
      displayOrder: 0,
    },
  ];
  const side = {
    ...compositionProduct(),
    id: tenantB,
    type: 'beverage',
    detailedIngredients: [],
    sauceMin: 0,
  };
  const flow = productFlow(product, new Map([[tenantB, side]]), 'en', compositionLabels);
  expect(
    selectionReviewRows(flow, flow.defaults, i18n.t).some(({ id }) => id.startsWith('side:')),
  ).toBe(false);
  expect(
    selectionReviewRows(
      flow,
      {
        ...flow.defaults,
        sides: { [productIds.sideLink]: { variationId: productIds.variation, quantity: 2 } },
      },
      i18n.t,
    ),
  ).toContainEqual({ id: `side:${productIds.sideLink}`, label: 'Drink · Small × 2' });
  expect(
    selectionReviewRows(
      { ...flow, variations: undefined },
      {
        ...flow.defaults,
        sides: { [productIds.sideLink]: { variationId: null, quantity: 1 } },
      },
      i18n.t,
    ).map(({ label }) => label),
  ).toEqual(['Drink × 1', 'Bread × 1', 'Salad × 1']);
});
