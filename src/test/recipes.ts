import type { Recipe } from '../domain/recipeChoices';
import { productIds, productDetailFixture } from './products';
type Ingredient = NonNullable<Recipe['detailedIngredients']>[number];
export const recipeIds = {
  fixed: productIds.ingredient,
  included: productIds.item,
  extra: productIds.sideLink,
  none: productIds.group,
  garlic: productIds.variation,
  hot: productIds.section,
};
export const recipeLabels = { ingredients: 'Ingredients', sauces: 'Sauces' };
function row(id: string, name: string, order: number, sauce = false): Ingredient {
  return {
    id,
    name,
    displayOrder: order,
    kind: sauce ? 'sauce' : 'ingredient',
    isOptional: true,
    isIncludedInBasePrice: false,
    isActive: true,
    price: 1,
    maxQuantity: 3,
    isNoneOption: false,
    content: null,
  };
}
export function recipeFixture(): Recipe {
  return {
    ...productDetailFixture(),
    customizationGroups: [],
    sauceMin: 0,
    sauceMax: 2,
    detailedIngredients: [
      { ...row(recipeIds.fixed, 'Bread', 0), isOptional: false },
      { ...row(recipeIds.included, 'Salad', 1), isIncludedInBasePrice: true },
      row(recipeIds.extra, 'Tomato', 2),
      { ...row(recipeIds.none, 'Library answer', 3, true), isNoneOption: true },
      row(recipeIds.garlic, 'Garlic', 4, true),
      row(recipeIds.hot, 'No sauce', 5, true),
    ],
  };
}
export function patchRecipe(
  change: (row: Ingredient) => Ingredient,
  recipe = recipeFixture(),
): Recipe {
  return { ...recipe, detailedIngredients: recipe.detailedIngredients?.map(change) ?? null };
}
