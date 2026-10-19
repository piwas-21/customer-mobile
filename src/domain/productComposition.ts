import { basketAddInputSchema, type BasketAddInput } from '../api/basketRequest';
import type { ProductDetail } from '../api/productDetail';
import type { CatalogueChoiceGroup } from './catalogueChoices';
import { explicitChoices } from './explicitChoices';
import { recipeChoices } from './recipeChoices';
import { projectRecipe } from './recipeProjection';
import { projectExplicitChoice } from './choiceProjection';
import { projectSides, sideChoices, type SideSelection } from './sideChoices';
import { projectVariation, variationChoices } from './variationChoices';
import type { Selection } from './customization';
import { productDecisions } from './productManifest';

export type ProductSelections = Readonly<{
  quantity: number;
  variationId: string | null;
  instructions: string;
  groups: Readonly<Record<string, Selection>>;
  sides: Readonly<Record<string, SideSelection>>;
}>;
export type CompositionLabels = Readonly<{
  base: string;
  ingredients: string;
  sauces: string;
}>;
export function productComposition(
  product: ProductDetail,
  details: ReadonlyMap<string, ProductDetail>,
  locale: string,
  labels: CompositionLabels,
) {
  requireOrderableProduct(product);
  const decisions = productDecisions(product);
  const groups = product.customizationGroups?.some(({ isActive }) => isActive)
    ? explicitChoices(product.customizationGroups, product.detailedIngredients, locale)
    : recipeChoices(product, locale, labels);
  return {
    decisions,
    groups,
    variations: variationChoices(product, locale, labels.base),
    sides: sideChoices(product, details, locale, labels.base),
  };
}
export function requireOrderableProduct(product: ProductDetail): void {
  if (
    !product.isActive ||
    !product.isAvailable ||
    !product.availability.canOrder ||
    product.isComponent ||
    product.menuDefinition ||
    !['mainItem', 'beverage', 'dessert', 'sauce', 'addOn'].includes(product.type)
  )
    throw new Error('Product unavailable for standalone ordering');
}
export function projectProductComposition(
  product: ProductDetail,
  details: ReadonlyMap<string, ProductDetail>,
  selection: ProductSelections,
): BasketAddInput {
  const { groups } = productComposition(product, details, '', {
    base: '',
    ingredients: '',
    sauces: '',
  });
  const ids = new Set(groups.map(({ id }) => id));
  if (Object.keys(selection.groups).some((id) => !ids.has(id)))
    throw new Error('Unknown customization selection');
  const recipe = groups.filter(({ kind }) => kind === 'recipe' || kind === 'sauce');
  const recipeSelections = Object.fromEntries(
    recipe.flatMap(({ id }) => (selection.groups[id] ? [[id, selection.groups[id]]] : [])),
  );
  return basketAddInputSchema.parse({
    productId: product.id,
    quantity: selection.quantity,
    specialInstructions: selection.instructions.trim(),
    ...projectVariation(product, selection.variationId),
    ...projectRecipe(recipe, recipeSelections),
    customizationSelections: groups
      .filter(({ kind }) => kind === 'explicit')
      .map((group) => projectExplicitChoice(group, selection.groups[group.id] ?? group.defaults)),
    ...projectSides(product, details, selection.sides),
  });
}
export function defaultGroupSelections(
  groups: readonly CatalogueChoiceGroup[],
): Record<string, Selection> {
  return Object.fromEntries(groups.map(({ id, defaults }) => [id, { ...defaults }]));
}
