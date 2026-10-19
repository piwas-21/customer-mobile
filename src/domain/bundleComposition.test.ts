import {
  bundleComposition,
  componentComposition,
  projectBundleComposition,
} from './bundleComposition';
import { bundleProduct, bundleSelection, dependentBundle, bundleIds } from '../test/bundles';
import { productIds } from '../test/products';
import { tenantA, tenantB } from '../test/fixtures';
import { compositionLabels, compositionProduct } from '../test/compositions';
import { recipeIds, recipeFixture } from '../test/recipes';
const project = (product = bundleProduct(), selection = bundleSelection()) =>
  projectBundleComposition(product, new Map(), selection);
it('preserves per-bundle portion counts, fixed row variation and exact independent identities', () => {
  expect(project()).toEqual({
    productId: tenantA,
    quantity: 3,
    specialInstructions: 'Together please',
    selectedMenuOptions: [
      {
        sectionId: productIds.section,
        menuSectionItemId: productIds.item,
        itemId: tenantB,
        productVariationId: productIds.variation,
        componentProductVariationId: productIds.variation,
        quantity: 2,
        specialInstructions: '',
        selectedIngredients: [],
        ingredientQuantities: {},
        customizationSelections: [],
        selectedSideItems: [],
      },
    ],
  });
});
it('offers only the fixed variation and refuses replacing it with a base or foreign choice', () => {
  const product = bundleProduct();
  const item = product.menuDefinition!.sections![0]!.items![0]!;
  expect(componentComposition(item, new Map(), 'fr', compositionLabels).variations).toEqual({
    defaultId: productIds.variation,
    options: [{ id: productIds.variation, label: 'Petit' }],
  });
  for (const variationId of [null, tenantA])
    expect(() =>
      project(product, {
        ...bundleSelection(),
        components: { [item.id]: { variationId, instructions: '', groups: {}, sides: {} } },
      }),
    ).toThrow('variation');
});
it('keeps dynamic component variation separate from the menu row variation', () => {
  const product = bundleProduct();
  product.menuDefinition!.sections![0]!.items![0]!.productVariationId = null;
  expect(project(product).selectedMenuOptions?.[0]).toMatchObject({
    productVariationId: null,
    componentProductVariationId: productIds.variation,
  });
});
it('projects component recipe removals, sauce choices and trimmed instructions through shared rules', () => {
  const product = bundleProduct();
  const recipe = recipeFixture();
  Object.assign(product.menuDefinition!.sections![0]!.items![0]!, {
    detailedIngredients: recipe.detailedIngredients,
    customizationGroups: recipe.customizationGroups,
    sauceMin: recipe.sauceMin,
    sauceMax: recipe.sauceMax,
  });
  const input = project(product, {
    ...bundleSelection(),
    components: {
      [productIds.item]: {
        variationId: productIds.variation,
        instructions: '  No cutlery  ',
        sides: {},
        groups: {
          recipe: { [recipeIds.fixed]: 1, [recipeIds.included]: 0, [recipeIds.extra]: 2 },
          sauce: { [recipeIds.garlic]: 1 },
        },
      },
    },
  });
  expect(input.selectedMenuOptions?.[0]).toMatchObject({
    specialInstructions: 'No cutlery',
    selectedIngredients: [recipeIds.fixed, recipeIds.extra, recipeIds.garlic],
    ingredientQuantities: { [recipeIds.included]: 0, [recipeIds.extra]: 2, [recipeIds.none]: 0 },
  });
});
it.each([0, 1, 3, 1.5, Number.NaN])(
  'refuses incomplete or excessive section portions %s',
  (quantity) => {
    expect(() =>
      project(bundleProduct(), {
        ...bundleSelection(),
        sections: { [productIds.section]: { [productIds.item]: quantity } },
      }),
    ).toThrow();
  },
);
it.each([0, 100, 1.5])('refuses invalid parent quantity %s', (quantity) => {
  expect(() => project(bundleProduct(), { ...bundleSelection(), quantity })).toThrow();
});
it('rejects unknown sections, orphan component state, unavailable rows and excessive notes', () => {
  expect(() =>
    project(bundleProduct(), { ...bundleSelection(), sections: { [tenantA]: {} } }),
  ).toThrow('Unknown');
  expect(() =>
    project(bundleProduct(), {
      ...bundleSelection(),
      components: {
        [tenantA]: { variationId: null, instructions: '', groups: {}, sides: {} },
      },
    }),
  ).toThrow('Unselected');
  const product = bundleProduct();
  product.menuDefinition!.sections![0]!.items![0]!.availability.canOrder = false;
  expect(() => project(product)).toThrow();
  expect(() =>
    project(bundleProduct(), { ...bundleSelection(), instructions: 'x'.repeat(501) }),
  ).toThrow();
});
it('enforces active dependent sections and suppresses them only when the parent was not selected', () => {
  const product = dependentBundle();
  expect(() => project(product)).toThrow('Incomplete');
  expect(
    project(product, {
      ...bundleSelection(),
      sections: {
        ...bundleSelection().sections,
        [bundleIds.dependent]: { [bundleIds.dependentRow]: 1 },
      },
    }).selectedMenuOptions,
  ).toHaveLength(2);
  product.menuDefinition!.sections![0]!.isRequired = false;
  const empty = { ...bundleSelection(), sections: {} };
  expect(() => project(product, empty)).toThrow('Required dependent');
  product.menuDefinition!.sections![1]!.isRequired = false;
  expect(project(product, empty).selectedMenuOptions).toEqual([]);
  expect(() =>
    project(product, {
      ...empty,
      sections: {
        [bundleIds.dependent]: { [bundleIds.dependentRow]: 1 },
      },
    }),
  ).toThrow('Inactive');
});
it('refuses future or ambiguous bundle contracts even at final projection', () => {
  const product = bundleProduct();
  product.menuDefinition!.authoringVersion = 2;
  expect(() => project(product)).toThrow('version');
  product.menuDefinition!.authoringVersion = 1;
  product.customerStepManifest = { schemaVersion: 2, revision: 0, steps: [] };
  expect(() => project(product)).toThrow('manifest');
  expect(() => bundleComposition(compositionProduct(), 'en')).toThrow('bundle');
});
