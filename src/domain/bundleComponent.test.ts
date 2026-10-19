import { projectBundleComposition } from './bundleComposition';
import { bundleProduct, bundleSelection } from '../test/bundles';
import { productIds, productDetailFixture } from '../test/products';
import { tenantA } from '../test/fixtures';
import { compositionProduct } from '../test/compositions';
const project = (product = bundleProduct(), selection = bundleSelection()) =>
  projectBundleComposition(product, new Map(), selection);
it('retains nested required-side association and product identities with current detail proof', () => {
  const product = bundleProduct();
  product.menuDefinition!.sections![0]!.items![0]!.suggestedSideItems = [
    {
      id: productIds.sideLink,
      sideItemProductId: tenantA,
      sideItemProductName: 'Drink',
      sideItemBasePrice: 3,
      sideItemProductType: 'beverage',
      availability: { canOrder: true },
      variations: [],
      isRequired: true,
      displayOrder: 0,
    },
  ];
  expect(() => project(product)).toThrow('Required side');
  const side = {
    ...compositionProduct(),
    id: tenantA,
    type: 'beverage',
    detailedIngredients: [],
    sauceMin: 0,
  };
  const selection = {
    ...bundleSelection(),
    components: {
      [productIds.item]: {
        variationId: productIds.variation,
        instructions: '',
        groups: {},
        sides: { [productIds.sideLink]: { quantity: 2, variationId: productIds.variation } },
      },
    },
  };
  expect(() => project(product, selection)).toThrow('Invalid side');
  expect(
    projectBundleComposition(product, new Map([[tenantA, side]]), selection)
      .selectedMenuOptions?.[0]?.selectedSideItems,
  ).toEqual([
    {
      id: tenantA,
      suggestedSideItemId: productIds.sideLink,
      quantity: 2,
      productVariationId: productIds.variation,
    },
  ]);
});
it('projects explicit component memberships without legacy recipe fields or invented prices', () => {
  const product = bundleProduct();
  const detail = productDetailFixture();
  const item = product.menuDefinition!.sections![0]!.items![0]!;
  item.customizationGroups =
    detail.customizationGroups?.map((group) => ({
      ...group,
      minSelection: 1,
      maxSelection: 1,
    })) ?? null;
  item.detailedIngredients = detail.detailedIngredients;
  const selection = {
    ...bundleSelection(),
    components: {
      [item.id]: {
        variationId: productIds.variation,
        instructions: '',
        sides: {},
        groups: { [productIds.group]: { [`ingredient:${productIds.item}`]: 2 } },
      },
    },
  };
  expect(project(product, selection).selectedMenuOptions?.[0]).toMatchObject({
    selectedIngredients: [],
    ingredientQuantities: {},
    customizationSelections: [
      {
        groupId: productIds.group,
        options: [{ kind: 'Ingredient', optionId: productIds.item, quantity: 2 }],
      },
    ],
  });
  expect(() => project(product)).toThrow('Incomplete');
});
it('refuses unavailable fixed variations and missing authoritative legacy recipe markers', () => {
  const product = bundleProduct();
  const item = product.menuDefinition!.sections![0]!.items![0]!;
  item.variations![0]!.isActive = false;
  expect(() => project(product)).toThrow();
  item.variations![0]!.isActive = true;
  item.detailedIngredients =
    productDetailFixture().detailedIngredients?.map(({ isNoneOption: _marker, ...row }) => row) ??
    [];
  expect(() => project(product)).toThrow('recipe contract');
});
it.each([
  { isActive: false },
  { isAvailable: false },
  { isComponent: true },
  { type: 'futureBundle' },
  { availability: { canOrder: false } },
  { variations: productDetailFixture().variations },
  { customizationGroups: productDetailFixture().customizationGroups },
  { detailedIngredients: productDetailFixture().detailedIngredients },
  { suggestedSideItems: productDetailFixture().suggestedSideItems },
])('refuses unsupported or unavailable root contract %j', (patch) => {
  expect(() => project({ ...bundleProduct(), ...patch })).toThrow('bundle');
});
