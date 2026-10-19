import type { ProductDetail } from '../api/productDetail';
import type { ProductSelections } from '../domain/productComposition';
import { productDetailFixture, productIds } from './products';
import { recipeFixture } from './recipes';
export const compositionLabels = { base: 'Standard', ingredients: 'Ingredients', sauces: 'Sauces' };
export function compositionProduct(): ProductDetail {
  return {
    ...productDetailFixture(),
    ...recipeFixture(),
    detailedIngredients:
      recipeFixture().detailedIngredients?.map((row) => ({
        ...row,
        isNoneOption: row.isNoneOption ?? false,
      })) ?? [],
    suggestedSideItems: [],
    customerStepManifest: null,
  };
}
export function compositionSelection(): ProductSelections {
  return {
    quantity: 2,
    variationId: productIds.variation,
    instructions: '  Please cut in half  ',
    groups: {},
    sides: {},
  };
}
export function explicitCompositionProduct(): ProductDetail {
  const product = productDetailFixture();
  return {
    ...product,
    suggestedSideItems: [],
    customerStepManifest: null,
    customizationGroups:
      product.customizationGroups?.map((group) => ({
        ...group,
        minSelection: 1,
        maxSelection: 1,
      })) ?? [],
  };
}
