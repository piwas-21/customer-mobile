import {
  defaultGroupSelections,
  productComposition,
  projectProductComposition,
} from './productComposition';
import {
  compositionLabels,
  compositionProduct,
  compositionSelection,
  explicitCompositionProduct,
} from '../test/compositions';
import { productIds } from '../test/products';
import { recipeIds } from '../test/recipes';
import { tenantA, tenantB } from '../test/fixtures';

it('composes one exact server-owned product request with explicit removal and ingredient units', () => {
  const product = compositionProduct();
  const result = projectProductComposition(product, new Map(), {
    ...compositionSelection(),
    groups: {
      recipe: { [recipeIds.fixed]: 1, [recipeIds.included]: 0, [recipeIds.extra]: 2 },
      sauce: { [recipeIds.garlic]: 1 },
    },
  });
  expect(result).toEqual({
    productId: tenantA,
    productVariationId: productIds.variation,
    quantity: 2,
    specialInstructions: 'Please cut in half',
    selectedIngredients: [recipeIds.fixed, recipeIds.extra, recipeIds.garlic],
    ingredientQuantities: {
      [recipeIds.fixed]: 1,
      [recipeIds.included]: 0,
      [recipeIds.extra]: 2,
      [recipeIds.none]: 0,
      [recipeIds.garlic]: 1,
      [recipeIds.hot]: 0,
    },
    customizationSelections: [],
    selectedSideItems: [],
  });
});
it('preserves full recipe defaults and returns independent editable group defaults', () => {
  const product = compositionProduct();
  const plan = productComposition(product, new Map(), 'fr', compositionLabels);
  const defaults = defaultGroupSelections(plan.groups);
  expect(plan.variations).toMatchObject({ defaultId: productIds.variation });
  expect(plan.variations.options[0]?.label).toBe('Petit');
  expect(defaults).toEqual({
    recipe: { [recipeIds.fixed]: 1, [recipeIds.included]: 1 },
    sauce: {},
  });
  expect(defaults.recipe).not.toBe(plan.groups[0]?.defaults);
  expect(
    projectProductComposition(product, new Map(), compositionSelection()).selectedIngredients,
  ).toEqual([recipeIds.fixed, recipeIds.included]);
});
it('uses explicit group membership instead of sending the legacy ingredient selection', () => {
  const product = explicitCompositionProduct();
  const input = projectProductComposition(product, new Map(), {
    ...compositionSelection(),
    groups: { [productIds.group]: { [`ingredient:${productIds.item}`]: 2 } },
  });
  expect(input.customizationSelections).toEqual([
    {
      groupId: productIds.group,
      options: [{ kind: 'Ingredient', optionId: productIds.item, quantity: 2 }],
    },
  ]);
  expect(input.selectedIngredients).toEqual([]);
  expect(input.ingredientQuantities).toEqual({});
  expect(() => projectProductComposition(product, new Map(), compositionSelection())).toThrow(
    'Incomplete',
  );
});
it.each([0, 100, 1.2, Number.NaN])(
  'rejects invalid line quantity %s before any write',
  (quantity) => {
    expect(() =>
      projectProductComposition(compositionProduct(), new Map(), {
        ...compositionSelection(),
        quantity,
      }),
    ).toThrow();
  },
);
it.each([
  { isActive: false },
  { isAvailable: false },
  { availability: { canOrder: false } },
  { isComponent: true },
  { type: 'futureDish' },
  { type: 'menu' },
])('refuses unavailable and unsupported standalone products %j', (patch) => {
  expect(() =>
    productComposition({ ...compositionProduct(), ...patch }, new Map(), 'en', compositionLabels),
  ).toThrow('unavailable');
});
it('refuses foreign group state, stale variations and overlong instructions', () => {
  const product = compositionProduct();
  expect(() =>
    projectProductComposition(product, new Map(), {
      ...compositionSelection(),
      groups: { foreign: {} },
    }),
  ).toThrow('Unknown');
  expect(() =>
    projectProductComposition(product, new Map(), {
      ...compositionSelection(),
      variationId: tenantB,
    }),
  ).toThrow('variation');
  expect(() =>
    projectProductComposition(product, new Map(), {
      ...compositionSelection(),
      instructions: 'x'.repeat(501),
    }),
  ).toThrow();
});
it('requires current side detail and projects association and product identities separately', () => {
  const product = {
    ...compositionProduct(),
    suggestedSideItems: [
      {
        id: tenantB,
        suggestedSideItemId: productIds.sideLink,
        name: 'Drink',
        price: 3,
        type: 'beverage',
        isRequired: true,
        displayOrder: 0,
      },
    ],
  };
  const side = {
    ...compositionProduct(),
    id: tenantB,
    detailedIngredients: [],
    sauceMin: 0,
    type: 'beverage',
  };
  expect(() => projectProductComposition(product, new Map(), compositionSelection())).toThrow(
    'Required side',
  );
  const sides = { [productIds.sideLink]: { quantity: 1, variationId: productIds.variation } };
  expect(() =>
    projectProductComposition(product, new Map(), { ...compositionSelection(), sides }),
  ).toThrow('Invalid side');
  expect(
    projectProductComposition(product, new Map([[tenantB, side]]), {
      ...compositionSelection(),
      sides,
    }).selectedSideItems,
  ).toEqual([
    {
      id: tenantB,
      suggestedSideItemId: productIds.sideLink,
      quantity: 1,
      productVariationId: productIds.variation,
    },
  ]);
});
it('cannot bypass an unsupported authored manifest by calling the final projection directly', () => {
  const product = {
    ...compositionProduct(),
    customerStepManifest: { schemaVersion: 2, revision: 0, steps: [] },
  };
  expect(() => projectProductComposition(product, new Map(), compositionSelection())).toThrow(
    'manifest',
  );
});
