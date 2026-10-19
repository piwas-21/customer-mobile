import type { SelectionSource } from './selectionComposition';
import { inDisplayOrder, stableChoiceId } from './catalogueChoices';

export type ProductStepKind =
  | 'ProductVariation'
  | 'ProductIngredient'
  | 'ProductSauce'
  | 'ProductCustomizationGroup'
  | 'ProductSuggestedSide';
export type ProductManifestRow = Readonly<{
  kind: ProductStepKind;
  targetId: string;
  role: string;
  order: number;
  label?: string | null;
}>;
export function defaultProductRows(product: SelectionSource): ProductManifestRow[] {
  const rows: ProductManifestRow[] = [];
  let order = 0;
  const append = (kind: ProductStepKind, ids: readonly (string | null)[], role: string) => {
    for (const targetId of ids)
      rows.push({ kind, targetId: stableChoiceId(targetId), role, order });
    if (ids.length) order++;
  };
  append(
    'ProductVariation',
    inDisplayOrder((product.variations ?? []).filter(({ isActive }) => isActive)).map(
      ({ id }) => id,
    ),
    product.hideBaseProduct ? 'RequiredChoice' : 'Dish',
  );
  const groups = inDisplayOrder(
    (product.customizationGroups ?? []).filter(({ isActive }) => isActive),
  );
  if (groups.length) {
    for (const group of [
      ...groups.filter(({ minSelection, isRequired }) => minSelection > 0 || isRequired),
      ...groups.filter(({ minSelection, isRequired }) => minSelection === 0 && !isRequired),
    ])
      append(
        'ProductCustomizationGroup',
        [group.id],
        group.minSelection > 0 || group.isRequired ? 'RequiredChoice' : 'Extra',
      );
  } else {
    const ingredients = inDisplayOrder(
      (product.detailedIngredients ?? []).filter(({ isActive }) => isActive),
    );
    append(
      'ProductIngredient',
      ingredients.filter(({ kind }) => kind === 'ingredient').map(({ id }) => id),
      'Ingredient',
    );
    append(
      'ProductSauce',
      ingredients.filter(({ kind }) => kind === 'sauce').map(({ id }) => id),
      'Sauce',
    );
  }
  const sides = inDisplayOrder(product.suggestedSideItems ?? []);
  for (const type of ['beverage', 'dessert', 'other']) {
    const selected = sides.filter((side) =>
      type === 'other' ? !['beverage', 'dessert'].includes(side.type) : side.type === type,
    );
    append(
      'ProductSuggestedSide',
      selected.map(({ suggestedSideItemId }) => suggestedSideItemId),
      type === 'beverage' ? 'Drink' : 'Side',
    );
  }
  return rows;
}
export function productRowKey(row: Pick<ProductManifestRow, 'kind' | 'targetId'>): string {
  return `${row.kind}:${row.targetId}`;
}
export function productScreenKey(row: ProductManifestRow): string {
  return `${row.kind}:${row.role}:${row.order}`;
}
export function isGlobalProductPicker(kind: ProductStepKind): boolean {
  return kind === 'ProductVariation' || kind === 'ProductSauce';
}
