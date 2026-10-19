import type { TFunction } from 'i18next';
import type { ItemSelections, selectionComposition } from '../../domain/selectionComposition';
import type { CatalogueChoiceGroup } from '../../domain/catalogueChoices';
import type { SideChoice } from '../../domain/sideChoices';
export type SelectionReviewRow = Readonly<{ id: string; label: string }>;
type ReviewPlan = Omit<ReturnType<typeof selectionComposition>, 'variations'> &
  Readonly<{ variations: ReturnType<typeof selectionComposition>['variations'] | undefined }>;
export function selectionReviewRows(
  plan: ReviewPlan,
  selection: ItemSelections,
  t: TFunction,
): SelectionReviewRow[] {
  const variation = plan.variations?.options.find(({ id }) => id === selection.variationId);
  return [
    ...(variation ? [{ id: 'variation', label: variation.label }] : []),
    ...sideRows(plan.sides, selection, t),
    ...groupRows(plan.groups, selection, t),
  ];
}
function sideRows(
  choices: readonly SideChoice[],
  selection: ItemSelections,
  t: TFunction,
): SelectionReviewRow[] {
  return choices.flatMap((side) => {
    const selected = selection.sides[side.membershipId];
    if (!selected) return [];
    const size = side.variations?.options.find(({ id }) => id === selected.variationId)?.label;
    return [
      {
        id: `side:${side.membershipId}`,
        label: t('selectedQuantity', {
          name: size ? `${side.label} · ${size}` : side.label,
          quantity: selected.quantity,
        }),
      },
    ];
  });
}
function groupRows(
  groups: readonly CatalogueChoiceGroup[],
  selection: ItemSelections,
  t: TFunction,
): SelectionReviewRow[] {
  return groups.flatMap((group) =>
    group.options.flatMap((option) => {
      const quantity = selection.groups[group.id]?.[option.id] ?? 0;
      const id = `group:${group.id}:${option.id}`;
      if (quantity > 0)
        return [{ id, label: t('selectedQuantity', { name: option.label, quantity }) }];
      if (group.kind === 'recipe' && (group.defaults[option.id] ?? 0) > 0)
        return [{ id, label: t('withoutIngredient', { name: option.label }) }];
      return [];
    }),
  );
}
