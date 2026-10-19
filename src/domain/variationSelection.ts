import type { VariationChoices } from './variationChoices';
import type { CatalogueChoiceGroup } from './catalogueChoices';
import type { Selection } from './customization';
const BASE = 'base';
export function variationGroup(choices: VariationChoices, label: string): CatalogueChoiceGroup {
  return {
    id: 'variation',
    kind: 'explicit',
    label,
    min: 1,
    max: 1,
    repeat: false,
    defaults: {},
    options: choices.options.map(({ id, label: optionLabel }, displayOrder) => ({
      id: id ?? BASE,
      targetId: id ?? BASE,
      label: optionLabel,
      displayOrder,
      kind: 'product',
      maxQuantity: 1,
      available: true,
    })),
  };
}
export function variationSelection(value: string | null): Selection {
  return { [value ?? BASE]: 1 };
}
export function selectedVariation(selection: Selection): string | null | undefined {
  const selected = Object.entries(selection).filter(([, quantity]) => quantity > 0);
  if (selected.length !== 1 || selected[0]![1] !== 1) return undefined;
  return selected[0]![0] === BASE ? null : selected[0]![0];
}
