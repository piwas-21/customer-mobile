import { bundleDecisions } from './bundleManifest';
import { bundleProduct, dependentBundle, bundleIds } from '../test/bundles';
import { productIds } from '../test/products';
import { tenantA, tenantB } from '../test/fixtures';
import { recipeFixture, recipeIds } from '../test/recipes';
type Step = NonNullable<
  NonNullable<ReturnType<typeof bundleProduct>['customerStepManifest']>['steps']
>[number];
const sectionStep: Step = {
  kind: 'BundleSection',
  targetId: productIds.section,
  compositionRole: 'Dish',
  presentationOrder: 0,
};
const ingredientStep: Step = {
  kind: 'BundleComponentIngredient',
  sectionId: productIds.section,
  sectionItemId: productIds.item,
  productId: tenantB,
  scopeId: recipeIds.fixed,
  compositionRole: 'Ingredient',
  presentationOrder: 1,
};
function withRecipe(steps: Step[]) {
  const product = bundleProduct();
  product.menuDefinition!.sections![0]!.items![0]!.detailedIngredients =
    recipeFixture().detailedIngredients?.map((row) => ({ ...row })) ?? null;
  product.customerStepManifest = { schemaVersion: 1, revision: 2, steps };
  return product;
}
it('creates a stable default section plan and completes authored recipe screens without dropping choices', () => {
  expect(bundleDecisions(bundleProduct())).toEqual([
    [
      {
        kind: 'BundleSection',
        sectionId: productIds.section,
        rowId: null,
        productId: null,
        scopeId: null,
        role: 'RequiredChoice',
        order: 0,
        label: null,
      },
    ],
  ]);
  const screens = bundleDecisions(withRecipe([sectionStep, ingredientStep]));
  expect(screens.map((rows) => rows[0]?.kind)).toEqual([
    'BundleSection',
    'BundleComponentIngredient',
    'BundleComponentSauce',
  ]);
  expect(screens[1]?.map(({ scopeId }) => scopeId).sort()).toEqual(
    [recipeIds.fixed, recipeIds.included, recipeIds.extra].sort(),
  );
  expect(screens[1]?.every(({ order }) => order === 1)).toBe(true);
  expect(screens[2]?.map(({ scopeId }) => scopeId).sort()).toEqual(
    [recipeIds.none, recipeIds.garlic, recipeIds.hot].sort(),
  );
});
it.each([
  { kind: 'FutureRule' },
  { sectionId: tenantA },
  { sectionItemId: tenantA },
  { productId: tenantA },
  { scopeId: tenantA },
  { targetId: tenantA },
  { parentComponentId: productIds.item },
  { compositionRole: 'Drink' },
  { presentationOrder: -1 },
  { presentationOrder: 0 },
  { presentationLabel: 'Unexpected' },
])('refuses unsupported, wrong-owner and conflicting component reference %j', (patch) => {
  expect(() =>
    bundleDecisions(withRecipe([sectionStep, { ...ingredientStep, ...patch }])),
  ).toThrow();
});
it.each([
  { targetId: tenantA },
  { sectionId: productIds.section },
  { sectionItemId: productIds.item },
  { productId: tenantB },
  { scopeId: productIds.variation },
  { compositionRole: 'Ingredient' },
  { presentationLabel: 'x'.repeat(121) },
])('refuses invalid section metadata %j', (patch) => {
  expect(() => bundleDecisions(withRecipe([{ ...sectionStep, ...patch }]))).toThrow();
});
it('refuses duplicate identities, duplicate rows, null steps and incompatible manifest versions', () => {
  expect(() => bundleDecisions(withRecipe([sectionStep, ingredientStep, ingredientStep]))).toThrow(
    'reference',
  );
  const product = bundleProduct();
  product.menuDefinition!.sections![0]!.items!.push(
    product.menuDefinition!.sections![0]!.items![0]!,
  );
  expect(() => bundleDecisions(product)).toThrow('Duplicate');
  product.menuDefinition!.sections![0]!.items!.pop();
  product.customerStepManifest = { schemaVersion: 1, revision: 0, steps: null };
  expect(() => bundleDecisions(product)).toThrow('manifest');
  product.customerStepManifest = { schemaVersion: 2, revision: 0, steps: [] };
  expect(() => bundleDecisions(product)).toThrow('manifest');
});
it('requires preparation after the section and rejects split sauce screens and inconsistent labels', () => {
  expect(() =>
    bundleDecisions(withRecipe([sectionStep, { ...ingredientStep, presentationOrder: 0 }])),
  ).toThrow();
  const sauce = { ...ingredientStep, kind: 'BundleComponentSauce', compositionRole: 'Sauce' };
  expect(() =>
    bundleDecisions(
      withRecipe([
        sectionStep,
        { ...sauce, scopeId: recipeIds.garlic, presentationOrder: 2 },
        { ...sauce, scopeId: recipeIds.hot, presentationOrder: 3 },
      ]),
    ),
  ).toThrow('Split');
  const product = bundleProduct();
  const row = product.menuDefinition!.sections![0]!.items![0]!;
  row.productVariationId = null;
  row.variations!.push({ ...row.variations![0]!, id: tenantA });
  const variation = {
    ...ingredientStep,
    kind: 'BundleComponentVariation',
    compositionRole: 'Dish',
  };
  product.customerStepManifest = {
    schemaVersion: 1,
    revision: 0,
    steps: [
      sectionStep,
      { ...variation, scopeId: productIds.variation, presentationLabel: 'Size' },
      { ...variation, scopeId: tenantA, presentationLabel: 'Other' },
    ],
  };
  expect(() => bundleDecisions(product)).toThrow('Conflicting');
  product.customerStepManifest.steps = [
    { ...sectionStep, compositionRole: 'RequiredChoice' },
    { ...variation, scopeId: productIds.variation, presentationLabel: 'Size' },
  ];
  expect(() => bundleDecisions(product)).toThrow('Dish');
});
it('validates dependency owner, Dish role, strict ordering and cycles', () => {
  expect(
    bundleDecisions(dependentBundle())
      .flat()
      .map(({ parentComponentId }) => parentComponentId),
  ).toEqual([null, productIds.item]);
  for (const parentComponentId of [tenantA, bundleIds.dependentRow]) {
    const product = dependentBundle();
    product.customerStepManifest!.steps![1]!.parentComponentId = parentComponentId;
    expect(() => bundleDecisions(product)).toThrow('dependency');
  }
  const product = dependentBundle();
  product.customerStepManifest!.steps![0]!.compositionRole = 'RequiredChoice';
  expect(() => bundleDecisions(product)).toThrow('dependency');
  product.customerStepManifest!.steps![0]!.compositionRole = 'Dish';
  product.customerStepManifest!.steps![0]!.parentComponentId = bundleIds.dependentRow;
  expect(() => bundleDecisions(product)).toThrow('dependency');
});
it('refuses optional extras before dependent required sections and completion cannot bypass ordering', () => {
  const product = dependentBundle();
  product.menuDefinition!.sections![0]!.items![0]!.detailedIngredients =
    recipeFixture().detailedIngredients?.map((row) => ({ ...row })) ?? null;
  product.customerStepManifest!.steps![1]!.presentationOrder = 3;
  product.customerStepManifest!.steps!.push({
    ...ingredientStep,
    compositionRole: 'Extra',
    presentationOrder: 2,
  });
  expect(() => bundleDecisions(product)).toThrow('Required');
  expect(() => bundleDecisions(withRecipe([{ ...ingredientStep, presentationOrder: 0 }]))).toThrow(
    'follow',
  );
});
