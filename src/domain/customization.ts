export type Choice = Readonly<{
  id: string;
  label: string;
  maxQuantity: number;
  available: boolean;
  minimumQuantity?: number;
  exclusionKey?: string | null;
  isNoneOption?: boolean;
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
  const selected = group.options.filter((option) => (selection[option.id] ?? 0) > 0);
  if (!exclusiveSelection(selected)) return 'invalid';
  if (group.options.some((option) => (selection[option.id] ?? 0) < (option.minimumQuantity ?? 0)))
    return 'invalid';
  let total = 0;
  for (const [id, quantity] of Object.entries(selection)) {
    const choice = choices.get(id);
    if (!validQuantity(choice, quantity, group.repeat)) return 'invalid';
    total += group.cardinality === 'choices' ? Number(quantity > 0) : quantity;
  }
  if (total < group.min) return 'minimum';
  if (total > group.max) return 'maximum';
  return 'valid';
}
function validQuantity(choice: Choice | undefined, quantity: number, repeat: boolean): boolean {
  return (
    choice !== undefined &&
    Number.isSafeInteger(quantity) &&
    quantity >= 0 &&
    quantity <= choice.maxQuantity &&
    (repeat || quantity <= 1) &&
    (choice.available || quantity === 0)
  );
}
export function changeChoice(
  group: ChoiceGroup,
  selection: Selection,
  id: string,
  delta: number,
): Selection {
  const target = group.options.find((option) => option.id === id);
  if (!target) return selection;
  const quantity = (selection[id] ?? 0) + delta;
  const next = { ...selection, [id]: quantity };
  if (quantity > 0) {
    for (const other of group.options) {
      if (other.id !== id && (selection[other.id] ?? 0) > 0 && mutuallyExclusive(target, other))
        next[other.id] = 0;
    }
  }
  const result = validateSelection(group, next);
  return result === 'invalid' || result === 'maximum' ? selection : next;
}
function mutuallyExclusive(first: Choice, second: Choice): boolean {
  return (
    first.isNoneOption === true ||
    second.isNoneOption === true ||
    Boolean(first.exclusionKey && first.exclusionKey === second.exclusionKey)
  );
}
function exclusiveSelection(selected: readonly Choice[]): boolean {
  if (selected.some((option) => option.isNoneOption) && selected.length > 1) return false;
  const keys = selected.map((option) => option.exclusionKey).filter(Boolean);
  return new Set(keys).size === keys.length;
}
export function quantityIsValid(quantity: number): boolean {
  return Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 99;
}
