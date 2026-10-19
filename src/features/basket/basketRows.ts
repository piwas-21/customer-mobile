import { compositionRows } from '../../domain/compositionRows';
import { canonicalUuidSchema } from '../../core/identifiers';
import type { BasketLine } from '../../api/basketResponse';
export type BasketRow = Readonly<{
  key: string;
  itemId: string | null;
  name: string | null;
  quantity: number;
  amount: number | null;
  description: string[];
  removed: string[];
  instructions: string | null;
  nested: boolean;
}>;
export function basketRows(items: readonly BasketLine[]): BasketRow[] {
  return compositionRows(
    items,
    (line) => line.childItems ?? [],
    (line, key, depth) => {
      const name = line.productName || line.menuName || null;
      const label = line.presentationLabel;
      return {
        key,
        itemId: depth === 0 && canonicalUuidSchema.safeParse(line.id).success ? line.id! : null,
        name: label && label !== name ? [label, name].filter(Boolean).join(' · ') : name,
        quantity: line.quantity,
        amount: depth === 0 ? line.itemTotal : null,
        description: [
          line.variationName,
          ...(line.selectedIngredientNames ?? []),
          ...(line.addedIngredientNames ?? []),
          ...(line.selectedSideItems ?? []).map((side) => {
            const name = [side.name, side.variationName].filter(Boolean).join(' · ');
            return `${side.quantity} × ${name}`;
          }),
        ].filter((value): value is string => Boolean(value)),
        removed: line.removedIngredientNames ?? [],
        instructions: line.specialInstructions ?? null,
        nested: depth > 0,
      };
    },
  );
}
