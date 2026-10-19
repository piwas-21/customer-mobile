import { bundleFlowPlan, defaultBundleSelection, reconcileBundleSelection } from './bundleFlowPlan';
import { bundleFlowSteps, bundleStepComplete, bundleFlowComplete } from './bundleFlow';
import { projectBundleComposition } from './bundleComposition';
import { bundleProduct, dependentBundle, bundleIds } from '../test/bundles';
import { productIds } from '../test/products';
import { compositionLabels } from '../test/compositions';
import { recipeFixture, recipeIds } from '../test/recipes';
const details = new Map();
function setup(product = bundleProduct()) {
  const plan = bundleFlowPlan(product, details, 'fr', compositionLabels);
  return { product, plan, selection: defaultBundleSelection(plan) };
}
it('starts with parent quantity, a portion-counting section and one final review', () => {
  const { plan, selection } = setup();
  const steps = bundleFlowSteps(plan, selection);
  expect(steps.map(({ kind }) => kind)).toEqual(['quantity', 'section', 'review']);
  expect(bundleStepComplete(steps[0]!, selection)).toBe(true);
  expect(bundleStepComplete(steps[1]!, selection)).toBe(false);
  expect(bundleStepComplete(steps[2]!, selection)).toBe(false);
  const chosen = reconcileBundleSelection(plan, {
    ...selection,
    quantity: 3,
    sections: { [productIds.section]: { [productIds.item]: 2 } },
  });
  expect(bundleStepComplete(steps[1]!, chosen)).toBe(true);
  expect(chosen.components[productIds.item]?.variationId).toBe(productIds.variation);
  expect(bundleFlowComplete(plan.product, details, chosen)).toBe(true);
  expect(projectBundleComposition(plan.product, details, chosen)).toMatchObject({
    quantity: 3,
    selectedMenuOptions: [{ menuSectionItemId: productIds.item, quantity: 2 }],
  });
});
it('uses authored section and nested screens only for selected row identities', () => {
  const product = bundleProduct();
  const item = product.menuDefinition!.sections![0]!.items![0]!;
  Object.assign(item, {
    detailedIngredients: recipeFixture().detailedIngredients,
    sauceMin: 1,
    sauceMax: 2,
  });
  item.productVariationId = null;
  const { plan, selection } = setup(product);
  expect(bundleFlowSteps(plan, selection).map(({ kind }) => kind)).toEqual([
    'quantity',
    'section',
    'review',
  ]);
  const chosen = reconcileBundleSelection(plan, {
    ...selection,
    sections: { [productIds.section]: { [productIds.item]: 2 } },
  });
  const steps = bundleFlowSteps(plan, chosen);
  expect(steps.map((step) => (step.kind === 'component' ? step.step.kind : step.kind))).toEqual([
    'quantity',
    'section',
    'variation',
    'groups',
    'groups',
    'review',
  ]);
  const ingredients = steps.find(
    (step) => step.kind === 'component' && step.step.kind === 'groups',
  );
  expect(ingredients).toMatchObject({ rowId: productIds.item });
  expect(chosen.components[productIds.item]?.groups.recipe?.[recipeIds.fixed]).toBe(1);
  expect(bundleStepComplete(ingredients!, chosen)).toBe(true);
  expect(bundleFlowComplete(product, details, chosen)).toBe(false);
});
it('discards nested notes and selections when a component is deselected and reselected', () => {
  const { plan, selection } = setup();
  const chosen = reconcileBundleSelection(plan, {
    ...selection,
    sections: { [productIds.section]: { [productIds.item]: 2 } },
  });
  const edited = {
    ...chosen,
    components: {
      ...chosen.components,
      [productIds.item]: { ...chosen.components[productIds.item]!, instructions: 'Private note' },
    },
  };
  const removed = reconcileBundleSelection(plan, { ...edited, sections: {} });
  expect(removed.components).toEqual({});
  const restored = reconcileBundleSelection(plan, { ...removed, sections: chosen.sections });
  expect(restored.components[productIds.item]?.instructions).toBe('');
});
it('clears transitive dependent selections and refuses inactive required decisions', () => {
  const product = dependentBundle();
  const { plan, selection } = setup(product);
  const dependent = bundleFlowSteps(plan, selection).find(
    (step) => step.kind === 'section' && step.group.id === bundleIds.dependent,
  )!;
  expect(dependent).toMatchObject({ active: false });
  expect(bundleStepComplete(dependent, selection)).toBe(false);
  const chosen = reconcileBundleSelection(plan, {
    ...selection,
    sections: {
      [productIds.section]: { [productIds.item]: 2 },
      [bundleIds.dependent]: { [bundleIds.dependentRow]: 1 },
    },
  });
  expect(bundleFlowComplete(product, details, chosen)).toBe(true);
  const removed = reconcileBundleSelection(plan, {
    ...chosen,
    sections: { ...chosen.sections, [productIds.section]: {} },
  });
  expect(removed.sections[bundleIds.dependent]).toEqual({});
  expect(removed.components).toEqual({});
  expect(bundleFlowComplete(product, details, removed)).toBe(false);
});
it('omits inactive optional dependent screens and rejects future manifests and stale state', () => {
  const product = dependentBundle();
  product.menuDefinition!.sections![1]!.isRequired = false;
  const { plan, selection } = setup(product);
  expect(bundleFlowSteps(plan, selection).map(({ kind }) => kind)).toEqual([
    'quantity',
    'section',
    'review',
  ]);
  expect(() =>
    reconcileBundleSelection(plan, {
      ...selection,
      sections: { unknown: { unknown: 1 } },
    }),
  ).toThrow('Unknown');
  product.customerStepManifest!.schemaVersion = 2;
  expect(() => setup(product)).toThrow('manifest');
});
it('revalidates final wire projection instead of trusting completion flags', () => {
  const { product, plan, selection } = setup();
  const chosen = reconcileBundleSelection(plan, {
    ...selection,
    sections: { [productIds.section]: { [productIds.item]: 2 } },
  });
  expect(bundleFlowComplete(product, details, chosen)).toBe(true);
  product.menuDefinition!.sections![0]!.items![0]!.availability.canOrder = false;
  expect(bundleFlowComplete(product, details, chosen)).toBe(false);
});
