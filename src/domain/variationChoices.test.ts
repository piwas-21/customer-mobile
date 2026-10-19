import { productDetailFixture, productIds } from '../test/products';
import { tenantA, tenantB } from '../test/fixtures';
import { projectVariation, variationChoices } from './variationChoices';

test('hides the base row, localizes variations and posts the exact variation identity', () => {
  const product = productDetailFixture();
  expect(variationChoices(product, 'fr', 'Original')).toEqual({
    options: [{ id: productIds.variation, label: 'Petit' }],
    defaultId: productIds.variation,
  });
  expect(projectVariation(product, productIds.variation)).toEqual({
    productVariationId: productIds.variation,
  });
  expect(() => projectVariation(product, null)).toThrow('Unavailable variation');
});

test('retains an explicit base answer when offered, while seeding the first active variation', () => {
  const product = { ...productDetailFixture(), hideBaseProduct: false };
  expect(variationChoices(product, 'en', 'Original').options).toEqual([
    { id: null, label: 'Original' },
    { id: productIds.variation, label: 'Small' },
  ]);
  expect(projectVariation(product, null)).toEqual({ productVariationId: null });
});

test.each([null, [], [{ ...productDetailFixture().variations![0]!, isActive: false }]])(
  'restores the base option when no active variation remains: %p',
  (variations) => {
    const product = { ...productDetailFixture(), variations };
    expect(variationChoices(product, 'en', 'Original')).toEqual({
      options: [{ id: null, label: 'Original' }],
      defaultId: null,
    });
    expect(projectVariation(product, null)).toEqual({ productVariationId: null });
    expect(() => projectVariation(product, productIds.variation)).toThrow();
  },
);

test('uses display order then stable identity, regardless of transport order or price', () => {
  const variation = productDetailFixture().variations![0]!;
  const product = {
    ...productDetailFixture(),
    variations: [
      { ...variation, id: productIds.variation, displayOrder: -1, isActive: false },
      { ...variation, id: tenantB, displayOrder: 1, finalPrice: 1 },
      { ...variation, id: tenantA, displayOrder: 1, finalPrice: 30 },
    ],
  };
  expect(variationChoices(product, 'en', 'Original').options.map(({ id }) => id)).toEqual([
    tenantA,
    tenantB,
  ]);
  expect(variationChoices(product, 'en', 'Original').defaultId).toBe(tenantA);
  expect(() => projectVariation(product, productIds.variation)).toThrow();
  expect(() => projectVariation(product, 'unknown')).toThrow();
});

test('refuses duplicate variation identities even across active and inactive rows', () => {
  const product = productDetailFixture();
  product.variations?.push({ ...product.variations[0]!, isActive: false });
  expect(() => variationChoices(product, 'en', 'Original')).toThrow('identities');
});
