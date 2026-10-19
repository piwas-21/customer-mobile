import type { ProductDetail } from '../api/productDetail';
import { customerName } from '../api/catalogue';
import {
  catalogueGroup,
  stableChoiceId,
  type CatalogueChoiceGroup,
  type DefaultChoice,
} from './catalogueChoices';
import { validateSelection } from './customization';

type Ingredient = Omit<
  NonNullable<ProductDetail['detailedIngredients']>[number],
  'isNoneOption'
> & {
  isNoneOption?: boolean;
};
export type Recipe = Readonly<{
  detailedIngredients: readonly Ingredient[] | null;
  customizationGroups: ProductDetail['customizationGroups'];
  sauceMin: number;
  sauceMax: number | null;
}>;
function ingredientChoice(ingredient: Ingredient, locale: string): DefaultChoice {
  if (
    !['ingredient', 'sauce'].includes(ingredient.kind) ||
    typeof ingredient.isNoneOption !== 'boolean'
  )
    throw new Error('Unsupported recipe contract');
  const included = !ingredient.isOptional || ingredient.isIncludedInBasePrice;
  if (included && ingredient.maxQuantity < 1) throw new Error('Unsupported base recipe');
  const id = stableChoiceId(ingredient.id);
  return {
    isDefault: included,
    option: {
      id,
      targetId: id,
      kind: 'ingredient',
      displayOrder: ingredient.displayOrder,
      label: customerName(ingredient, locale),
      maxQuantity: ingredient.isOptional && !ingredient.isNoneOption ? ingredient.maxQuantity : 1,
      minimumQuantity: ingredient.isOptional ? 0 : 1,
      available: ingredient.maxQuantity > 0,
      isNoneOption: ingredient.isNoneOption,
      exclusionKey: ingredient.exclusionGroup?.trim() || null,
    },
  };
}
function maximumDistinctChoices(choices: readonly DefaultChoice[]): number {
  const available = choices.map(({ option }) => option).filter(({ available }) => available);
  if (available.some((option) => option.isNoneOption && (option.minimumQuantity ?? 0) > 0))
    return 1;
  const normal = available.filter((option) => !option.isNoneOption);
  const ungrouped = normal.filter((option) => !option.exclusionKey).length;
  const keys = new Set(
    normal.filter((option) => option.exclusionKey).map((option) => option.exclusionKey),
  );
  return Math.max(ungrouped + keys.size, Number(available.some((option) => option.isNoneOption)));
}
function recipeGroup(
  kind: 'recipe' | 'sauce',
  label: string,
  choices: readonly DefaultChoice[],
  min: number,
  max: number,
): CatalogueChoiceGroup {
  if (min > maximumDistinctChoices(choices)) throw new Error('Unsupported recipe minimum');
  const group = catalogueGroup(
    { id: kind, kind, label, min, max, repeat: true, cardinality: 'choices' },
    choices,
  );
  // Keep the complete base recipe. Truncating included rows would silently change the quoted dish.
  const defaults = Object.fromEntries(
    choices.filter(({ isDefault }) => isDefault).map(({ option }) => [option.id, 1]),
  );
  const validity = validateSelection(group, defaults);
  if (validity === 'invalid' || validity === 'maximum') throw new Error('Unsupported base recipe');
  return { ...group, defaults };
}
export function recipeChoices(
  recipe: Recipe,
  locale: string,
  labels: Readonly<{ ingredients: string; sauces: string }>,
): CatalogueChoiceGroup[] {
  if (recipe.customizationGroups?.some((group) => group.isActive))
    throw new Error('Explicit customization requires group selections');
  const ingredients = (recipe.detailedIngredients ?? []).filter(({ isActive }) => isActive);
  if (new Set(ingredients.map(({ id }) => id)).size !== ingredients.length)
    throw new Error('Unsupported recipe identities');
  const plain: DefaultChoice[] = [];
  const sauces: DefaultChoice[] = [];
  for (const ingredient of ingredients) {
    const choice = ingredientChoice(ingredient, locale);
    (ingredient.kind === 'sauce' ? sauces : plain).push(choice);
  }
  const groups: CatalogueChoiceGroup[] = [];
  if (plain.length) groups.push(recipeGroup('recipe', labels.ingredients, plain, 0, plain.length));
  if (sauces.length || recipe.sauceMin > 0)
    groups.push(
      recipeGroup(
        'sauce',
        labels.sauces,
        sauces,
        recipe.sauceMin,
        recipe.sauceMax ?? sauces.length,
      ),
    );
  return groups;
}
