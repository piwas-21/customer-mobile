import type { CustomerBasket } from './basketResponse';
import type { CheckoutLine } from './checkoutComposition';
import { canonicalUuidSchema } from '../core/identifiers';
import { ApiFailure } from '../core/apiFailure';

// Capture only original root identity and requested composition. Server prices remain authoritative.
export function checkoutRootBinding(basket: CustomerBasket) {
  const roots = new Map(
    basket.items.map((row) => [
      canonicalUuidSchema.parse(row.id),
      {
        productId: row.productId ?? null,
        menuId: row.menuId ?? null,
        variationId: row.productVariationId ?? null,
        quantity: row.quantity,
        instructions: row.specialInstructions ?? null,
      },
    ]),
  );
  if (roots.size !== basket.items.length) throw new ApiFailure(0, 'contract');
  return (items: CheckoutLine[]) => {
    if (
      items.length !== roots.size ||
      new Set(items.map((row) => row.basketItemId)).size !== items.length ||
      items.some((row) => {
        const reviewed = row.basketItemId ? roots.get(row.basketItemId) : undefined;
        return (
          (row.productId ?? null) !== reviewed?.productId ||
          (row.menuId ?? null) !== reviewed?.menuId ||
          (row.productVariationId ?? null) !== reviewed?.variationId ||
          row.quantity !== reviewed?.quantity ||
          (row.specialInstructions ?? null) !== reviewed?.instructions
        );
      })
    )
      throw new ApiFailure(200, 'contract');
  };
}
