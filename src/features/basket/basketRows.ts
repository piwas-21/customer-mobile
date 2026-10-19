import type { BasketLine } from '../../api/basketResponse';
export type BasketRow = Readonly<{
  key: string;
  name: string | null;
  quantity: number;
  amount: number | null;
  description: string[];
  removed: string[];
  instructions: string | null;
  nested: boolean;
}>;
const MAX_ROWS = 1000;
const MAX_DEPTH = 8;
export function basketRows(items: readonly BasketLine[]): BasketRow[] {
  const rows: BasketRow[] = [];
  const stack = items.map((line, index) => ({ line, key: String(index), depth: 0 })).reverse();
  while (stack.length) {
    const { line, key, depth } = stack.pop()!;
    if (depth > MAX_DEPTH || rows.length >= MAX_ROWS)
      throw new Error('Unsupported basket composition');
    const name = line.productName || line.menuName || null;
    const label = line.presentationLabel;
    rows.push({
      key,
      name: label && label !== name ? [label, name].filter(Boolean).join(' · ') : name,
      quantity: line.quantity,
      amount: depth === 0 ? line.itemTotal : null,
      description: [
        line.variationName,
        ...(line.selectedIngredientNames ?? []),
        ...(line.addedIngredientNames ?? []),
        ...(line.selectedSideItems ?? []).map(
          (side) =>
            `${side.quantity} × ${side.name}${side.variationName ? ` · ${side.variationName}` : ''}`,
        ),
      ].filter((value): value is string => Boolean(value)),
      removed: line.removedIngredientNames ?? [],
      instructions: line.specialInstructions ?? null,
      nested: depth > 0,
    });
    const children = line.childItems ?? [];
    for (let index = children.length - 1; index >= 0; index--)
      stack.push({ line: children[index]!, key: `${key}.${index}`, depth: depth + 1 });
  }
  return rows;
}
