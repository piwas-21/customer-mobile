import { productDetailSchema, readProduct, type OrderType } from './productDetail';
import { bundleDetailFixture, productDetailFixture, productIds } from '../test/products';
import { response, setup } from '../test/transport';
import { tenantA, tenantB } from '../test/fixtures';

it('preserves stable option and association IDs, nullable rules and recorded allergen absence', () => {
  const product = productDetailSchema.parse(productDetailFixture());
  expect(product.suggestedSideItems?.[0]).toMatchObject({
    id: tenantB,
    suggestedSideItemId: productIds.sideLink,
  });
  expect(product.detailedIngredients?.[0]).toMatchObject({
    maxQuantity: 3,
    isNoneOption: false,
    exclusionGroup: 'choice',
    kind: 'sauce',
  });
  expect(product.customizationGroups?.[0]).toMatchObject({
    minSelection: 2,
    maxSelection: 2,
    includedFreeUnits: 1,
    ingredientOptions: [{ productIngredientId: productIds.ingredient }],
    productOptions: [{ optionProductId: tenantB, availability: { canOrder: false } }],
  });
  expect(product.sauceMax).toBeNull();
  expect(product.allergens).toBeNull();
  expect(product.variations?.[0]).toMatchObject({ priceModifier: -2, finalPrice: 10 });
});
it('reads the response bundle shape, retaining repeated choices and nested product rules', () => {
  const wire = bundleDetailFixture();
  const product = productDetailSchema.parse(wire);
  const section = product.menuDefinition?.sections?.[0];
  expect(section).toMatchObject({
    id: productIds.section,
    minSelection: 2,
    maxSelection: 2,
    allowRepeatedItems: true,
    translations: { fr: { name: 'Deux viandes' } },
  });
  expect(section?.items?.[0]).toMatchObject({
    id: productIds.item,
    productId: tenantB,
    productVariationId: productIds.variation,
    allergens: ['milk'],
    availability: { canOrder: false },
    sauceMin: 1,
    sauceMax: 3,
    suggestedSideItems: [
      { id: productIds.sideLink, sideItemProductId: tenantA, availability: { canOrder: false } },
    ],
  });
  expect(section?.items?.[0]?.detailedIngredients?.[0]).toHaveProperty('isNoneOption', false);
  expect(section?.items?.[0]?.customizationGroups).toEqual(product.customizationGroups);
});
it('keeps future enum values and manifest versions visible for fail-closed ordering', () => {
  const wire = productDetailFixture();
  const product = productDetailSchema.parse({
    ...wire,
    type: 'futureType',
    availability: { canOrder: false, reason: 'FutureReason' },
    detailedIngredients: [{ ...wire.detailedIngredients?.[0], kind: 'futureKind' }],
    customerStepManifest: {
      schemaVersion: 2,
      revision: 0,
      steps: [
        {
          kind: 'FutureRequiredDecision',
          compositionRole: 'FutureRole',
          presentationOrder: 0,
        },
      ],
    },
  });
  expect(product.type).toBe('futureType');
  expect(product.availability.reason).toBe('FutureReason');
  expect(product.detailedIngredients?.[0]?.kind).toBe('futureKind');
  expect(product.customerStepManifest).toEqual({
    schemaVersion: 2,
    revision: 0,
    steps: [
      {
        kind: 'FutureRequiredDecision',
        compositionRole: 'FutureRole',
        presentationOrder: 0,
      },
    ],
  });
});
it('strips authoring metadata without inventing choices from absent fields', () => {
  expect(
    productDetailSchema.parse({
      ...productDetailFixture(),
      translationMetadata: { private: 'discard' },
      variations: null,
      detailedIngredients: null,
      customizationGroups: null,
      suggestedSideItems: null,
      customerStepManifest: null,
    }),
  ).toMatchObject({ variations: null, detailedIngredients: null, customerStepManifest: null });
  const { variations: _removed, ...incomplete } = productDetailFixture();
  expect(productDetailSchema.safeParse(incomplete).success).toBe(false);
  expect(
    productDetailSchema.parse({ ...productDetailFixture(), translationMetadata: {} }),
  ).not.toHaveProperty('translationMetadata');
});
it.each([
  { sauceMax: -1 },
  { sauceMin: -1 },
  { basePrice: Infinity },
  { customerStepManifest: { schemaVersion: 1, revision: -1, steps: [] } },
  { detailedIngredients: [{ id: 'not-an-id' }] },
  { customizationGroups: [{ minSelection: -1 }] },
])('rejects malformed rule fields rather than replacing them with defaults: %j', (patch) => {
  expect(productDetailSchema.safeParse({ ...productDetailFixture(), ...patch }).success).toBe(
    false,
  );
});
it('requests the channel-specific detail anonymously and captures locale', async () => {
  const { client, context, fetcher } = setup();
  fetcher.mockResolvedValue(response({ success: true, data: bundleDetailFixture() }));
  const product = await readProduct(client, context, tenantA, 'fr', 'Takeaway');
  expect(product.menuDefinition?.sections?.[0]?.allowRepeatedItems).toBe(true);
  expect(fetcher.mock.calls[0]?.[0]).toBe(
    `https://alpha.example/api/Products/${tenantA}?requestedOrderType=Takeaway`,
  );
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
    credentials: 'omit',
    redirect: 'error',
    headers: { 'Accept-Language': 'fr' },
  });
  expect(fetcher.mock.calls[0]?.[1].headers).not.toHaveProperty('Authorization');
});
it('does not treat an unsolicited product response as the requested product', async () => {
  const { client, context, fetcher } = setup();
  fetcher.mockResolvedValue(
    response({ success: true, data: { ...productDetailFixture(), id: tenantB } }),
  );
  await expect(readProduct(client, context, tenantA, 'en')).rejects.toMatchObject({
    reason: 'contract',
  });
  expect(fetcher.mock.calls[0]?.[0]).toBe(`https://alpha.example/api/Products/${tenantA}`);
});
it('validates identity and channel before dispatch and refuses a late restaurant response', async () => {
  const { client, context, fetcher, boundary } = setup();
  await expect(readProduct(client, context, 'bad-id', 'en')).rejects.toThrow();
  await expect(readProduct(client, context, tenantA, 'en', 'bad' as OrderType)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockImplementation(async () => {
    boundary.select(tenantB);
    return response({ success: true, data: productDetailFixture() });
  });
  await expect(readProduct(client, context, tenantA, 'en')).rejects.toMatchObject({
    reason: 'network',
  });
});

it('preserves a zero sauce cap as no sauces allowed, distinct from an unlimited null cap', () => {
  const product = productDetailSchema.parse({
    ...productDetailFixture(),
    sauceMin: 0,
    sauceMax: 0,
    sauceIncludedFree: 0,
  });
  expect(product.sauceMax).toBe(0);
  expect(productDetailSchema.parse(productDetailFixture()).sauceMax).toBeNull();
});

it('preserves new bundle answer markers while leaving missing old metadata unknown', () => {
  const wire = bundleDetailFixture();
  const ingredient = wire.menuDefinition?.sections?.[0]?.items?.[0]?.detailedIngredients?.[0];
  if (!ingredient) throw new Error('Missing ingredient fixture');
  delete ingredient.isNoneOption;
  expect(
    productDetailSchema.parse(wire).menuDefinition?.sections?.[0]?.items?.[0]
      ?.detailedIngredients?.[0],
  ).not.toHaveProperty('isNoneOption');
  ingredient.isNoneOption = true;
  expect(
    productDetailSchema.parse(wire).menuDefinition?.sections?.[0]?.items?.[0]
      ?.detailedIngredients?.[0],
  ).toHaveProperty('isNoneOption', true);
});
