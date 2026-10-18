import type { components } from '../api/generated';
import type { CatalogueChoiceGroup } from './catalogueChoices';
import { validateSelection, type Selection } from './customization';

function selectedChoices(group: CatalogueChoiceGroup, selection: Selection) {
  if (validateSelection(group, selection) !== 'valid') throw new Error('Incomplete customization');
  return group.options.flatMap((option) => {
    const quantity = selection[option.id] ?? 0;
    return quantity > 0 ? [{ option, quantity }] : [];
  });
}
export function projectExplicitChoice(
  group: CatalogueChoiceGroup,
  selection: Selection,
): components['schemas']['CustomizationGroupSelectionDto'] {
  if (group.kind !== 'explicit') throw new Error('Wrong customization scope');
  return {
    groupId: group.id,
    options: selectedChoices(group, selection).map(({ option, quantity }) => {
      if (!option.membershipId || option.kind === 'bundle')
        throw new Error('Unsupported customization membership');
      return {
        kind: option.kind === 'ingredient' ? 'Ingredient' : 'Product',
        optionId: option.membershipId,
        quantity,
      };
    }),
  };
}
export function projectBundleChoice(
  group: CatalogueChoiceGroup,
  selection: Selection,
): components['schemas']['SelectedMenuOptionDto'][] {
  if (group.kind !== 'bundle') throw new Error('Wrong customization scope');
  return selectedChoices(group, selection).map(({ option, quantity }) => {
    if (option.kind !== 'bundle') throw new Error('Unsupported bundle membership');
    return {
      sectionId: group.id,
      menuSectionItemId: option.id,
      itemId: option.targetId,
      productVariationId: option.fixedVariationId ?? null,
      quantity,
    };
  });
}
