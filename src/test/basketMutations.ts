import type { BasketItemMutation } from '../api/basketItemMutation';
import { basketResponse } from './basketApi';
import { basketSessionId, type basketOperationsFixture } from './basketOperations';
export function basketMutation(action: 'Update' | 'Remove' = 'Update'): BasketItemMutation {
  const basket = basketResponse();
  const revision = {
    basketItemId: basket.items[0]!.id!,
    expectedBasketId: basket.id,
    expectedPurchaseFingerprint: basket.purchaseFingerprint,
  };
  return action === 'Update'
    ? { ...revision, action, quantity: 3, specialInstructions: 'Keep this note' }
    : { ...revision, action };
}
export async function existingBasketSession(fixture: ReturnType<typeof basketOperationsFixture>) {
  const id = fixture.createId();
  if (id !== basketSessionId) throw new Error('Fixture sequence changed');
  await fixture.repository.vault.saveCapability(
    fixture.context,
    'guest-session',
    { kind: 'guest', id: 'basket' },
    id,
  );
}
