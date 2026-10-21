import type { TableAccountItem } from '../../api/tableAccountItem';

// The public frozen projection has no ingredient ID. Identical duplicates are interchangeable;
// content identity plus its occurrence retains separate rows without tying keys to list position.
export function tableIngredientRows(item: TableAccountItem) {
  const occurrences = new Map<string, number>();
  return item.ingredientCustomizations.map((ingredient) => {
    const identity = JSON.stringify([
      ingredient.name,
      ingredient.quantity,
      ingredient.removed,
      ingredient.addOn,
    ]);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return { key: identity + '/' + occurrence, ingredient };
  });
}
