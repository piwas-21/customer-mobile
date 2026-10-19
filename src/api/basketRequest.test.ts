import { basketAddInputSchema } from './basketRequest';
import { tenantA, tenantB } from '../test/fixtures';
const input = { productId: tenantA, quantity: 1 };
test('accepts supported recipe, explicit, bundle and side identities without accepting client prices', () => {
  expect(
    basketAddInputSchema.parse({
      ...input,
      specialInstructions: 'Sans oignon',
      selectedIngredients: [tenantB],
      ingredientQuantities: { [tenantB]: 0 },
      customizationSelections: [
        { groupId: tenantA, options: [{ kind: 'Product', optionId: tenantB, quantity: 1 }] },
      ],
      selectedSideItems: [
        { id: tenantB, suggestedSideItemId: tenantA, quantity: 2, productVariationId: null },
      ],
      selectedMenuOptions: [
        {
          sectionId: tenantA,
          menuSectionItemId: tenantB,
          itemId: tenantA,
          quantity: 1,
          componentProductVariationId: tenantB,
        },
      ],
    }),
  ).toHaveProperty('ingredientQuantities', { [tenantB]: 0 });
  expect(
    basketAddInputSchema.parse({
      ...input,
      productVariationId: null,
      selectedIngredients: null,
      ingredientQuantities: null,
      customizationSelections: null,
      selectedSideItems: null,
      selectedMenuOptions: null,
    }),
  ).toHaveProperty('selectedMenuOptions', null);
});
test.each([
  { ...input, price: 0 },
  { ...input, operationId: tenantB },
  { ...input, quantity: 0 },
  { ...input, quantity: 100 },
  { ...input, quantity: 1.5 },
  { ...input, specialInstructions: 'a'.repeat(501) },
  {
    ...input,
    customizationSelections: [
      { groupId: tenantA, options: [{ kind: 'Future', optionId: tenantB, quantity: 1 }] },
    ],
  },
  { ...input, selectedSideItems: [{ id: tenantA, quantity: 1 }] },
])('refuses unsupported or invalid wire fields %p', (request) => {
  expect(basketAddInputSchema.safeParse(request).success).toBe(false);
});
