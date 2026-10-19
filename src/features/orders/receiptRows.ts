import type { CheckoutLine } from '../../api/checkoutComposition';
import { compositionRows } from '../../domain/compositionRows';
import type { BasketRow } from '../basket/basketRows';
export function receiptRows(items: readonly CheckoutLine[]): BasketRow[] {
  return compositionRows(
    items,
    (line) => line.children,
    (line, key, depth) => ({
      key,
      itemId: null,
      name:
        line.presentationLabel && line.presentationLabel !== line.name
          ? `${line.presentationLabel} · ${line.name}`
          : line.name,
      quantity: line.quantity,
      amount: depth === 0 ? line.itemTotal : null,
      description: [
        line.variationName,
        ...line.ingredients
          .filter((item) => !item.isRemoved)
          .map((item) => `${item.quantity} × ${item.name}`),
      ].filter((value): value is string => Boolean(value)),
      removed: line.ingredients.filter((item) => item.isRemoved).map((item) => item.name),
      instructions: line.specialInstructions ?? null,
      nested: depth > 0,
    }),
  );
}
