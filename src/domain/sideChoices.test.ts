import type { ProductDetail } from '../api/productDetail';
import { productDetailFixture, productIds } from '../test/products';
import { tenantA, tenantB } from '../test/fixtures';
import { defaultSides, projectSides, sideChoices } from './sideChoices';

function fixture() {
  const product = productDetailFixture();
  const side: ProductDetail = {
    ...productDetailFixture(),
    id: tenantB,
    type: 'beverage',
    sauceMin: 0,
    customizationGroups: null,
  };
  return { product, side, details: new Map([[tenantB, side]]) };
}
const selected = { [productIds.sideLink]: { quantity: 2, variationId: productIds.variation } };

test('posts product and membership identities independently, including the selected variation', () => {
  const { product, details } = fixture();
  expect(projectSides(product, details, selected)).toEqual({
    selectedSideItems: [
      {
        id: tenantB,
        suggestedSideItemId: productIds.sideLink,
        quantity: 2,
        productVariationId: productIds.variation,
      },
    ],
  });
  expect(sideChoices(product, details, 'fr', 'Original')[0]?.variations?.options).toEqual([
    { id: productIds.variation, label: 'Petit' },
  ]);
});

test('required sides default to one and cannot be omitted', () => {
  const { product, details } = fixture();
  product.suggestedSideItems![0]!.isRequired = true;
  const choices = sideChoices(product, details, 'en', 'Original');
  expect(defaultSides(choices)).toEqual({
    [productIds.sideLink]: { quantity: 1, variationId: productIds.variation },
  });
  expect(() => projectSides(product, details, {})).toThrow('Required side missing');
  expect(projectSides(product, details, defaultSides(choices)).selectedSideItems).toHaveLength(1);
});

test('optional sides have no defaults and empty selections are explicit', () => {
  const { product, details } = fixture();
  expect(defaultSides(sideChoices(product, details, 'en', 'Original'))).toEqual({});
  expect(projectSides(product, details, {})).toEqual({ selectedSideItems: [] });
  expect(sideChoices({ suggestedSideItems: null }, details, 'en', '')).toEqual([]);
});

test.each([0, -1, 1.5, 100, Infinity, NaN])('rejects invalid quantity %p', (quantity) => {
  const { product, details } = fixture();
  expect(() =>
    projectSides(product, details, {
      [productIds.sideLink]: { quantity, variationId: productIds.variation },
    }),
  ).toThrow('Invalid side selection');
});

test.each([
  { isActive: false },
  { isAvailable: false },
  { availability: { canOrder: false } },
  { isComponent: true },
  { type: 'future' },
  { type: 'menu' },
  { sauceMin: 1 },
  { customizationGroups: productDetailFixture().customizationGroups },
  {
    customizationGroups: productDetailFixture().customizationGroups!.map((group) => ({
      ...group,
      authoringVersion: 2,
      minSelection: 0,
    })),
  },
])('requires current orderable side details: %p', (change) => {
  const { product, side, details } = fixture();
  Object.assign(side, change);
  product.suggestedSideItems![0]!.isRequired = true;
  const choices = sideChoices(product, details, 'en', 'Original');
  expect(choices[0]?.available).toBe(false);
  expect(() => defaultSides(choices)).toThrow('Required side unavailable');
  expect(() => projectSides(product, details, selected)).toThrow('Invalid side selection');
});

test('missing, mismatched, ambiguous or unknown identities cannot become a selection', () => {
  const { product, side, details } = fixture();
  expect(sideChoices(product, new Map(), 'en', '')[0]?.available).toBe(false);
  expect(() => projectSides(product, new Map(), selected)).toThrow();
  expect(() =>
    sideChoices(product, new Map([[tenantB, { ...side, id: tenantA }]]), 'en', ''),
  ).toThrow('Wrong side product');
  expect(() =>
    projectSides(product, details, { unknown: { quantity: 1, variationId: null } }),
  ).toThrow('Unknown side membership');
  product.suggestedSideItems?.push({ ...product.suggestedSideItems[0]! });
  expect(() => sideChoices(product, details, 'en', '')).toThrow('Unsupported side identities');
});

test('two associations of one product remain independently selected in display order', () => {
  const { product, details } = fixture();
  product.suggestedSideItems?.push({
    ...product.suggestedSideItems[0]!,
    suggestedSideItemId: productIds.item,
    displayOrder: -1,
  });
  const result = projectSides(product, details, {
    ...selected,
    [productIds.item]: { quantity: 99, variationId: productIds.variation },
  });
  expect(
    result.selectedSideItems?.map(({ suggestedSideItemId, quantity }) => [
      suggestedSideItemId,
      quantity,
    ]),
  ).toEqual([
    [productIds.item, 99],
    [productIds.sideLink, 2],
  ]);
});

test('a side variation must belong to the offered product; the hidden base cannot be selected', () => {
  const { product, details } = fixture();
  for (const variationId of [null, tenantA]) {
    expect(() =>
      projectSides(product, details, { [productIds.sideLink]: { quantity: 1, variationId } }),
    ).toThrow('Unavailable variation');
  }
});

test('does not reject inactive or optional explicit groups with no required decisions', () => {
  const { product, side, details } = fixture();
  side.customizationGroups = productDetailFixture().customizationGroups!.map((group) => ({
    ...group,
    isActive: false,
  }));
  expect(projectSides(product, details, selected).selectedSideItems).toHaveLength(1);
  side.customizationGroups = side.customizationGroups.map((group) => ({
    ...group,
    isActive: true,
    minSelection: 0,
  }));
  expect(projectSides(product, details, selected).selectedSideItems).toHaveLength(1);
});
