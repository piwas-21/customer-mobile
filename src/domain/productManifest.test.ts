import { productDecisions } from './productManifest';
import { compositionProduct, explicitCompositionProduct } from '../test/compositions';
import { recipeIds } from '../test/recipes';
import { productIds } from '../test/products';
import { tenantA } from '../test/fixtures';

it('derives stable variation, full recipe and one global sauce screen without a manifest', () => {
  expect(productDecisions(compositionProduct())).toEqual([
    {
      id: 'ProductVariation:RequiredChoice:0',
      kind: 'ProductVariation',
      targetIds: [productIds.variation],
      label: null,
      role: 'RequiredChoice',
    },
    {
      id: 'ProductIngredient:Ingredient:1',
      kind: 'ProductIngredient',
      targetIds: [recipeIds.fixed, recipeIds.included, recipeIds.extra],
      label: null,
      role: 'Ingredient',
    },
    {
      id: 'ProductSauce:Sauce:2',
      kind: 'ProductSauce',
      targetIds: [recipeIds.garlic, recipeIds.hot, recipeIds.none].sort(),
      label: null,
      role: 'Sauce',
    },
  ]);
});
it('honors authored order and fills missing ingredient references into one compatible screen', () => {
  const product = compositionProduct();
  product.customerStepManifest = {
    schemaVersion: 1,
    revision: 4,
    steps: [
      {
        kind: 'ProductSauce',
        targetId: recipeIds.garlic,
        compositionRole: 'Sauce',
        presentationOrder: 8,
      },
      {
        kind: 'ProductIngredient',
        targetId: recipeIds.fixed,
        compositionRole: 'Ingredient',
        presentationOrder: 4,
      },
      {
        kind: 'ProductVariation',
        targetId: productIds.variation,
        compositionRole: 'Dish',
        presentationLabel: 'Your bowl',
        presentationOrder: 1,
      },
    ],
  };
  const steps = productDecisions(product);
  expect(steps.map(({ id }) => id)).toEqual([
    'ProductVariation:Dish:1',
    'ProductIngredient:Ingredient:4',
    'ProductSauce:Sauce:8',
  ]);
  expect(steps[0]?.label).toBe('Your bowl');
  expect(steps[1]?.targetIds).toEqual(
    [recipeIds.fixed, recipeIds.included, recipeIds.extra].sort(),
  );
  expect(steps[2]?.targetIds).toEqual([recipeIds.garlic, recipeIds.hot, recipeIds.none].sort());
});
it('orders explicit required groups before extras and partitions beverage/dessert/other sides', () => {
  const product = explicitCompositionProduct();
  const group = product.customizationGroups![0]!;
  product.customizationGroups = [
    { ...group, id: tenantA, minSelection: 0, isRequired: false, displayOrder: -1 },
    group,
  ];
  product.suggestedSideItems = [
    {
      id: tenantA,
      suggestedSideItemId: recipeIds.garlic,
      name: 'Bread',
      price: 2,
      type: 'addOn',
      isRequired: false,
      displayOrder: 0,
    },
    {
      id: tenantA,
      suggestedSideItemId: recipeIds.hot,
      name: 'Cake',
      price: 2,
      type: 'dessert',
      isRequired: false,
      displayOrder: 1,
    },
    {
      id: tenantA,
      suggestedSideItemId: recipeIds.none,
      name: 'Water',
      price: 2,
      type: 'beverage',
      isRequired: false,
      displayOrder: 2,
    },
  ];
  expect(productDecisions(product).map(({ targetIds }) => targetIds)).toEqual([
    [productIds.variation],
    [productIds.group],
    [tenantA],
    [recipeIds.none],
    [recipeIds.hot],
    [recipeIds.garlic],
  ]);
});
it.each([
  { schemaVersion: 2, revision: 0, steps: [] },
  { schemaVersion: 1, revision: -1, steps: [] },
  { schemaVersion: 1, revision: 0.5, steps: [] },
  { schemaVersion: 1, revision: 0, steps: null },
])('refuses unknown or malformed manifest metadata %j', (customerStepManifest) => {
  expect(() => productDecisions({ ...compositionProduct(), customerStepManifest })).toThrow(
    'manifest',
  );
});
it.each([
  { kind: 'FutureChoice', targetId: recipeIds.fixed },
  { kind: 'ProductIngredient', targetId: tenantA },
  { kind: 'ProductIngredient', targetId: recipeIds.fixed, scopeId: tenantA },
  { kind: 'ProductIngredient', targetId: recipeIds.fixed, compositionRole: 'Unknown' },
  { kind: 'ProductIngredient', targetId: recipeIds.fixed, presentationLabel: 'Misleading' },
  { kind: 'ProductIngredient', targetId: recipeIds.fixed, presentationOrder: -1 },
  { kind: 'ProductIngredient', targetId: recipeIds.fixed, presentationOrder: 1.5 },
])('refuses stale, future, wrong-owner and invalid presentation refs %j', (row) => {
  const customerStepManifest = {
    schemaVersion: 1,
    revision: 0,
    steps: [{ presentationOrder: 0, ...row }],
  };
  expect(() => productDecisions({ ...compositionProduct(), customerStepManifest })).toThrow(
    'reference',
  );
});
it('rejects duplicate identities, conflicting screens, split global pickers and invalid dependency order', () => {
  const ingredient = { kind: 'ProductIngredient', targetId: recipeIds.fixed, presentationOrder: 0 };
  const run = (
    steps: NonNullable<ReturnType<typeof compositionProduct>['customerStepManifest']>['steps'],
  ) =>
    productDecisions({
      ...compositionProduct(),
      customerStepManifest: { schemaVersion: 1, revision: 0, steps },
    });
  expect(() => run([ingredient, ingredient])).toThrow('Duplicate');
  expect(() =>
    run([ingredient, { kind: 'ProductSauce', targetId: recipeIds.garlic, presentationOrder: 0 }]),
  ).toThrow('Conflicting');
  expect(() =>
    run([
      { kind: 'ProductSauce', targetId: recipeIds.garlic, presentationOrder: 1 },
      { kind: 'ProductSauce', targetId: recipeIds.hot, presentationOrder: 2 },
    ]),
  ).toThrow('Split');
  expect(() =>
    run([
      { ...ingredient, compositionRole: 'Extra', presentationOrder: 0 },
      {
        kind: 'ProductVariation',
        targetId: productIds.variation,
        compositionRole: 'RequiredChoice',
        presentationOrder: 1,
      },
    ]),
  ).toThrow('Required');
});
