import {
  productFlow,
  flowStepComplete,
  productFlowComplete,
  selectionForChoices,
} from './productFlow';
import {
  compositionLabels,
  compositionProduct,
  explicitCompositionProduct,
} from '../test/compositions';
import { productIds } from '../test/products';
import { recipeIds } from '../test/recipes';
import { tenantB } from '../test/fixtures';
it('starts with quantity, follows authored decisions, and adds a single final review', () => {
  const product = compositionProduct();
  const flow = productFlow(product, new Map(), 'en', compositionLabels);
  expect(flow.steps.map(({ kind }) => kind)).toEqual([
    'quantity',
    'variation',
    'groups',
    'groups',
    'review',
  ]);
  expect(flow.defaults).toEqual({
    quantity: 1,
    variationId: productIds.variation,
    instructions: '',
    groups: { recipe: { [recipeIds.fixed]: 1, [recipeIds.included]: 1 }, sauce: {} },
    sides: {},
  });
  expect(flowStepComplete(flow.steps[0]!, flow.defaults)).toBe(true);
  expect(flowStepComplete(flow.steps[1]!, flow.defaults)).toBe(true);
  expect(flowStepComplete(flow.steps.at(-1)!, flow.defaults)).toBe(false);
  expect(productFlowComplete(product, new Map(), flow.defaults)).toBe(true);
});
it('retains full recipe state when an authored screen contains only a subset', () => {
  const product = compositionProduct();
  product.customerStepManifest = {
    schemaVersion: 1,
    revision: 1,
    steps: [
      { kind: 'ProductVariation', targetId: productIds.variation, presentationOrder: 0 },
      { kind: 'ProductIngredient', targetId: recipeIds.fixed, presentationOrder: 1 },
      { kind: 'ProductIngredient', targetId: recipeIds.included, presentationOrder: 2 },
    ],
  };
  const { steps, defaults } = productFlow(product, new Map(), 'en', compositionLabels);
  const screens = steps.filter((step) => step.kind === 'groups');
  expect(screens).toHaveLength(4);
  const first = screens[0]!.choices[0]!;
  expect(first.sourceId).toBe('recipe');
  expect(first.group.options.map(({ id }) => id)).toEqual([recipeIds.fixed]);
  expect(selectionForChoices(first.group, defaults.groups.recipe!)).toEqual({
    [recipeIds.fixed]: 1,
  });
  expect(flowStepComplete(screens[0]!, defaults)).toBe(true);
  expect(defaults.groups.recipe).toEqual({ [recipeIds.fixed]: 1, [recipeIds.included]: 1 });
});
it('requires exact explicit memberships while counting a repeated ingredient as one choice', () => {
  const product = explicitCompositionProduct();
  const { steps, defaults } = productFlow(product, new Map(), 'en', compositionLabels);
  const group = steps.find((step) => step.kind === 'groups')!;
  expect(flowStepComplete(group, defaults)).toBe(false);
  const selected = {
    ...defaults,
    groups: { [productIds.group]: { [`ingredient:${productIds.item}`]: 2 } },
  };
  expect(flowStepComplete(group, selected)).toBe(true);
  expect(productFlowComplete(product, new Map(), selected)).toBe(true);
  expect(productFlowComplete(product, new Map(), { ...selected, groups: { unknown: {} } })).toBe(
    false,
  );
});
it('keeps the final projection as the authority for invalid quantities and stale variations', () => {
  const product = compositionProduct();
  const flow = productFlow(product, new Map(), 'en', compositionLabels);
  expect(flowStepComplete(flow.steps[0]!, { ...flow.defaults, quantity: 0 })).toBe(false);
  expect(
    flowStepComplete(flow.steps[1]!, { ...flow.defaults, variationId: productIds.sideLink }),
  ).toBe(false);
  expect(
    productFlowComplete(product, new Map(), { ...flow.defaults, instructions: 'x'.repeat(501) }),
  ).toBe(false);
  product.customerStepManifest = { schemaVersion: 2, revision: 0, steps: [] };
  expect(() => productFlow(product, new Map(), 'en', compositionLabels)).toThrow('manifest');
});
it('prepares required sides from current detail and validates quantity/variation within that membership', () => {
  const product = compositionProduct();
  product.suggestedSideItems = [
    {
      id: tenantB,
      suggestedSideItemId: productIds.sideLink,
      name: 'Drink',
      price: 2,
      type: 'beverage',
      isRequired: true,
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
  const details = new Map([[tenantB, side]]);
  const { steps, defaults } = productFlow(product, details, 'en', compositionLabels);
  const step = steps.find((row) => row.kind === 'sides')!;
  expect(defaults.sides).toEqual({
    [productIds.sideLink]: { quantity: 1, variationId: productIds.variation },
  });
  expect(flowStepComplete(step, defaults)).toBe(true);
  expect(flowStepComplete(step, { ...defaults, sides: {} })).toBe(false);
  expect(
    flowStepComplete(step, {
      ...defaults,
      sides: {
        [productIds.sideLink]: { quantity: 0, variationId: productIds.variation },
      },
    }),
  ).toBe(false);
  expect(
    flowStepComplete(step, {
      ...defaults,
      sides: {
        [productIds.sideLink]: { quantity: 1, variationId: productIds.ingredient },
      },
    }),
  ).toBe(false);
  expect(() => productFlow(product, new Map(), 'en', compositionLabels)).toThrow('Required side');
  product.suggestedSideItems[0]!.isRequired = false;
  const optional = productFlow(product, new Map(), 'en', compositionLabels);
  const unavailable = optional.steps.find((row) => row.kind === 'sides')!;
  expect(flowStepComplete(unavailable, optional.defaults)).toBe(true);
  expect(flowStepComplete(unavailable, { ...optional.defaults, sides: defaults.sides })).toBe(
    false,
  );
});
