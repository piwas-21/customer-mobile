import { bundleFlowPlan, defaultBundleSelection, reconcileBundleSelection } from './bundleFlowPlan';
import { bundleFlowSteps, bundleStepComplete } from './bundleFlow';
import { bundleProduct, dependentBundle, bundleIds } from '../test/bundles';
import { productIds } from '../test/products';
import { compositionLabels } from '../test/compositions';
import { recipeFixture, recipeIds } from '../test/recipes';
const details = new Map();
it('preserves authored nested subsets alongside full exclusion/default rules', () => {
  const product = bundleProduct();
  const item = product.menuDefinition!.sections![0]!.items![0]!;
  item.detailedIngredients = [...(recipeFixture().detailedIngredients ?? [])];
  const nested = {
    sectionId: productIds.section,
    sectionItemId: item.id,
    productId: item.productId,
  };
  product.customerStepManifest = {
    schemaVersion: 1,
    revision: 1,
    steps: [
      { kind: 'BundleSection', targetId: productIds.section, presentationOrder: 0 },
      {
        kind: 'BundleComponentIngredient',
        ...nested,
        scopeId: recipeIds.fixed,
        presentationOrder: 1,
      },
      {
        kind: 'BundleComponentIngredient',
        ...nested,
        scopeId: recipeIds.included,
        presentationOrder: 2,
      },
    ],
  };
  const plan = bundleFlowPlan(product, details, 'en', compositionLabels);
  const selection = reconcileBundleSelection(plan, {
    ...defaultBundleSelection(plan),
    sections: { [productIds.section]: { [item.id]: 2 } },
  });
  const components = bundleFlowSteps(plan, selection).filter((step) => step.kind === 'component');
  expect(components).toHaveLength(4);
  const first = components[0]!;
  expect(first.step).toMatchObject({
    kind: 'groups',
    choices: [{ group: { options: [{ id: recipeIds.fixed }] } }],
  });
  expect(first.groups.find(({ id }) => id === 'recipe')?.options.map(({ id }) => id)).toEqual([
    recipeIds.fixed,
    recipeIds.included,
    recipeIds.extra,
  ]);
  expect(bundleStepComplete(first, selection)).toBe(true);
  expect(selection.components[item.id]?.groups.recipe).toEqual({
    [recipeIds.fixed]: 1,
    [recipeIds.included]: 1,
  });
});
it('clears descendants in authored dependency order when the root is removed', () => {
  const product = dependentBundle();
  const thirdSection = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const thirdRow = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const dependent = product.menuDefinition!.sections![1]!;
  product.menuDefinition!.sections!.push({
    ...dependent,
    id: thirdSection,
    displayOrder: 2,
    items: [{ ...dependent.items![0]!, id: thirdRow }],
  });
  product.customerStepManifest!.steps!.push({
    kind: 'BundleSection',
    targetId: thirdSection,
    parentComponentId: bundleIds.dependentRow,
    compositionRole: 'Extra',
    presentationOrder: 2,
  });
  product.customerStepManifest!.steps![1]!.compositionRole = 'Dish';
  const plan = bundleFlowPlan(product, details, 'en', compositionLabels);
  const selected = reconcileBundleSelection(plan, {
    ...defaultBundleSelection(plan),
    sections: {
      [productIds.section]: { [productIds.item]: 2 },
      [bundleIds.dependent]: { [bundleIds.dependentRow]: 1 },
      [thirdSection]: { [thirdRow]: 1 },
    },
  });
  expect(Object.keys(selected.components)).toHaveLength(3);
  const removed = reconcileBundleSelection(plan, {
    ...selected,
    sections: { ...selected.sections, [productIds.section]: {} },
  });
  expect(removed.sections[thirdSection]).toEqual({});
  expect(removed.sections[bundleIds.dependent]).toEqual({});
  expect(removed.components).toEqual({});
});
