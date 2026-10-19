import type { Choice, ChoiceGroup, Selection } from './customization';

export type CatalogueChoice = Choice &
  Readonly<{
    kind: 'ingredient' | 'product' | 'bundle';
    displayOrder: number;
    targetId: string;
    membershipId?: string;
    fixedVariationId?: string | null;
  }>;
export type CatalogueChoiceGroup = Omit<ChoiceGroup, 'options'> &
  Readonly<{
    kind: 'explicit' | 'bundle' | 'recipe' | 'sauce';
    options: readonly CatalogueChoice[];
    defaults: Selection;
  }>;
export type DefaultChoice = Readonly<{ option: CatalogueChoice; isDefault: boolean }>;

export function stableChoiceId(id: string | null): string {
  if (!id) throw new Error('Unsupported customization identity');
  return id;
}
export function catalogueGroup(
  group: Omit<CatalogueChoiceGroup, 'options' | 'defaults'>,
  choices: readonly DefaultChoice[],
): CatalogueChoiceGroup {
  const ordered = [...choices].sort(
    (a, b) =>
      a.option.displayOrder - b.option.displayOrder || a.option.id.localeCompare(b.option.id),
  );
  const options = ordered.map(({ option }) => option);
  if (group.min > group.max || new Set(options.map(({ id }) => id)).size !== options.length)
    throw new Error('Unsupported customization rules');
  const defaults: Record<string, number> = {};
  let count = 0;
  for (const { option, isDefault } of ordered) {
    if (!isDefault || !option.available || option.maxQuantity < 1 || count >= group.max) continue;
    defaults[option.id] = 1;
    count++;
  }
  return { ...group, options, defaults };
}
export function inDisplayOrder<T extends { displayOrder: number; id: string | null }>(
  items: readonly T[],
): T[] {
  return [...items].sort(
    (a, b) => a.displayOrder - b.displayOrder || (a.id ?? '').localeCompare(b.id ?? ''),
  );
}

export function distinctGroups(groups: CatalogueChoiceGroup[]): CatalogueChoiceGroup[] {
  if (new Set(groups.map(({ id }) => id)).size !== groups.length)
    throw new Error('Unsupported customization group identities');
  return groups;
}
