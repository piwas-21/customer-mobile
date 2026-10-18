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
  cardinality?: 'units' | 'choices';
  options: readonly Choice[];
}>;
export type Selection = Readonly<Record<string, number>>;
export function validateSelection(
  group: ChoiceGroup,
  selection: Selection,
): 'valid' | 'minimum' | 'maximum' | 'invalid' {
  const choices = new Map(group.options.map((option) => [option.id, option]));
  if (choices.size !== group.options.length) return 'invalid';
  let total = 0;
  for (const [id, quantity] of Object.entries(selection)) {
    const choice = choices.get(id);
    if (
      !choice ||
      !Number.isSafeInteger(quantity) ||
      quantity < 0 ||
      quantity > choice.maxQuantity ||
      (!group.repeat && quantity > 1) ||
      (!choice.available && quantity > 0)
    )
      return 'invalid';
    total += group.cardinality === 'choices' ? Number(quantity > 0) : quantity;
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
