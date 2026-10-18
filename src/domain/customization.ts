export type Choice = Readonly<{
  id: string;
  label: string;
  maxQuantity: number;
  available: boolean;
}>;
export type ChoiceGroup = Readonly<{
  id: string;
  label: string;
  min: number;
  max: number;
  repeat: boolean;
  options: readonly Choice[];
}>;
export type Selection = Readonly<Record<string, number>>;
export function validateSelection(
  group: ChoiceGroup,
  selection: Selection,
): 'valid' | 'minimum' | 'maximum' | 'invalid' {
  let total = 0;
  for (const [id, quantity] of Object.entries(selection)) {
    const choice = group.options.find((option) => option.id === id);
    if (
      !choice ||
      !Number.isSafeInteger(quantity) ||
      quantity < 0 ||
      quantity > choice.maxQuantity ||
      (!group.repeat && quantity > 1) ||
      (!choice.available && quantity > 0)
    )
      return 'invalid';
    total += quantity;
  }
  if (total < group.min) return 'minimum';
  if (total > group.max) return 'maximum';
  return 'valid';
}
export function changeChoice(
  group: ChoiceGroup,
  selection: Selection,
  id: string,
  delta: number,
): Selection {
  const next = { ...selection, [id]: (selection[id] ?? 0) + delta };
  const result = validateSelection(group, next);
  return result === 'invalid' || result === 'maximum' ? selection : next;
}
export function quantityIsValid(quantity: number): boolean {
  return Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 99;
}
