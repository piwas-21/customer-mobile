import { useState } from 'react';
import type { BasketRow } from './basketRows';
import type { useBasket } from './BasketProvider';
import { basketItemMutationSchema } from '../../api/basketItemMutation';
type BasketState = ReturnType<typeof useBasket>;
export type BasketSelection = Readonly<{
  owner: BasketState['revision'];
  revision: Readonly<{
    basketItemId: string;
    expectedBasketId: string;
    expectedPurchaseFingerprint: string;
  }>;
  name: string | null;
  quantity: number;
  instructions: string | null;
}>;
export default function useBasketSelection(basket: BasketState) {
  const [selection, setSelection] = useState<BasketSelection>();
  const owner = basket.revision;
  const current = selection?.owner === owner ? selection : undefined;
  function edit(row: BasketRow) {
    if (!basket.canAdd) return;
    const parsed = basketItemMutationSchema.safeParse({
      action: 'Remove',
      basketItemId: row.itemId,
      expectedBasketId: basket.basket?.id,
      expectedPurchaseFingerprint: basket.basket?.purchaseFingerprint,
    });
    if (!parsed.success) return;
    const { basketItemId, expectedBasketId, expectedPurchaseFingerprint } = parsed.data;
    setSelection(
      Object.freeze({
        owner,
        revision: Object.freeze({ basketItemId, expectedBasketId, expectedPurchaseFingerprint }),
        name: row.name,
        quantity: row.quantity,
        instructions: row.instructions,
      }),
    );
  }
  return {
    current,
    edit,
    changed: Boolean(
      current &&
      (current.revision.expectedBasketId !== basket.basket?.id ||
        current.revision.expectedPurchaseFingerprint !== basket.basket?.purchaseFingerprint),
    ),
    close: () => setSelection((previous) => (previous === current ? undefined : previous)),
  };
}
