import type { components } from '../api/generated';
import type { CatalogueChoiceGroup } from './catalogueChoices';
import { validateSelection, type Selection } from './customization';

function projectGroup(group: CatalogueChoiceGroup, selection: Selection) {
  if (group.kind !== 'recipe' && group.kind !== 'sauce') throw new Error('Wrong recipe scope');
  if (validateSelection(group, selection) !== 'valid') throw new Error('Incomplete recipe');
  return group.options.map((option) => {
    if (option.kind !== 'ingredient') throw new Error('Unsupported recipe identity');
    return { id: option.targetId, quantity: selection[option.id] ?? 0 };
  });
}
export function projectRecipe(
  groups: readonly CatalogueChoiceGroup[],
  selections: Readonly<Record<string, Selection>>,
): Pick<components['schemas']['AddToBasketDto'], 'selectedIngredients' | 'ingredientQuantities'> {
  const groupIds = new Set(groups.map(({ id }) => id));
  if (Object.keys(selections).some((id) => !groupIds.has(id)))
    throw new Error('Wrong recipe scope');
  const rows = groups.flatMap((group) =>
    projectGroup(group, selections[group.id] ?? group.defaults),
  );
  if (new Set(rows.map(({ id }) => id)).size !== rows.length)
    throw new Error('Unsupported recipe identity');
  return {
    selectedIngredients: rows.filter(({ quantity }) => quantity > 0).map(({ id }) => id),
    ingredientQuantities: Object.fromEntries(rows.map(({ id, quantity }) => [id, quantity])),
  };
}
