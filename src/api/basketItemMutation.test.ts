import { basketItemMutationRequest, basketItemMutationSchema } from './basketItemMutation';
import { basketResponse } from '../test/basketApi';
import { basketOperationId as operationId } from '../test/basketOperations';
const basket = basketResponse();
const revision = {
  basketItemId: basket.items[0]!.id!,
  expectedBasketId: basket.id,
  expectedPurchaseFingerprint: basket.purchaseFingerprint,
};
it('sends absolute root edits with the reviewed server revision and exact original operation', () => {
  expect(
    basketItemMutationRequest(
      { ...revision, action: 'Update', quantity: 3, specialInstructions: 'No salt' },
      operationId,
    ),
  ).toEqual({
    path: `/api/customer-mobile/basket/items/${revision.basketItemId}/operations`,
    body: {
      expectedBasketId: basket.id,
      expectedPurchaseFingerprint: basket.purchaseFingerprint,
      action: 'Update',
      quantity: 3,
      specialInstructions: 'No salt',
      operationId,
    },
  });
});
it('keeps removal free of quantities and instructions and refuses client price/owner claims', () => {
  const removal = { ...revision, action: 'Remove' };
  expect(basketItemMutationSchema.parse(removal)).toEqual(removal);
  for (const extra of [
    { quantity: 1 },
    { specialInstructions: null },
    { total: 1 },
    { userId: basket.id },
  ])
    expect(basketItemMutationSchema.safeParse({ ...removal, ...extra }).success).toBe(false);
});
it.each([0, -1, 100, 1.5, Number.NaN])('refuses an invalid absolute quantity %s', (quantity) => {
  expect(
    basketItemMutationSchema.safeParse({
      ...revision,
      action: 'Update',
      quantity,
      specialInstructions: null,
    }).success,
  ).toBe(false);
});
it('refuses missing revision/operation identifiers and notes that are omitted or excessive', () => {
  const update = { ...revision, action: 'Update' as const, quantity: 1, specialInstructions: null };
  for (const patch of [
    { expectedBasketId: '' },
    { basketItemId: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA' },
    { expectedPurchaseFingerprint: '' },
    { specialInstructions: 'x'.repeat(501) },
    { specialInstructions: undefined },
  ])
    expect(basketItemMutationSchema.safeParse({ ...update, ...patch }).success).toBe(false);
  expect(() => basketItemMutationRequest(update, '')).toThrow();
});
