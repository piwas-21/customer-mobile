import type { ProductDetail } from '../api/productDetail';
import { explicitChoices } from './explicitChoices';
import { recipeChoices, type Recipe } from './recipeChoices';
import { projectRecipe } from './recipeProjection';
import { projectExplicitChoice } from './choiceProjection';
import { projectSides, sideChoices, type SideSelection } from './sideChoices';
import { projectVariation, variationChoices, type VariationSource } from './variationChoices';
import type { Selection } from './customization';

export type SelectionSource = Recipe & VariationSource & Pick<ProductDetail, 'suggestedSideItems'>;
export type ItemSelections = Readonly<{
  variationId: string | null;
  instructions: string;
  groups: Readonly<Record<string, Selection>>;
  sides: Readonly<Record<string, SideSelection>>;
}>;
export type CompositionLabels = Readonly<{ base: string; ingredients: string; sauces: string }>;
export function selectionComposition(
  source: SelectionSource,
  details: ReadonlyMap<string, ProductDetail>,
  locale: string,
  labels: CompositionLabels,
) {
  const groups = source.customizationGroups?.some(({ isActive }) => isActive)
    ? explicitChoices(source.customizationGroups, source.detailedIngredients, locale)
    : recipeChoices(source, locale, labels);
  return {
    groups,
    variations: variationChoices(source, locale, labels.base),
    sides: sideChoices(source, details, locale, labels.base),
  };
}
export function projectItemSelections(
  source: SelectionSource,
  details: ReadonlyMap<string, ProductDetail>,
  selection: ItemSelections,
) {
  const { groups } = selectionComposition(source, details, '', {
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
  return {
    specialInstructions: selection.instructions.trim(),
    ...projectVariation(source, selection.variationId),
    ...projectRecipe(recipe, recipeSelections),
    customizationSelections: groups
      .filter(({ kind }) => kind === 'explicit')
      .map((group) => projectExplicitChoice(group, selection.groups[group.id] ?? group.defaults)),
    ...projectSides(source, details, selection.sides),
  };
}
