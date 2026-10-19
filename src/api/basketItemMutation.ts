import { z } from 'zod';
import { quantityIsValid } from '../domain/customization';
import { canonicalUuidSchema } from '../core/identifiers';
const revision = {
  basketItemId: canonicalUuidSchema,
  expectedBasketId: canonicalUuidSchema,
  expectedPurchaseFingerprint: z.string().regex(/^[a-fA-F0-9]{64}$/),
};
export const basketItemMutationSchema = z.discriminatedUnion('action', [
  z
    .object({
      ...revision,
      action: z.literal('Update'),
      quantity: z.number().int().refine(quantityIsValid),
      specialInstructions: z.string().max(500).nullable(),
    })
    .strict(),
  z.object({ ...revision, action: z.literal('Remove') }).strict(),
]);
export type BasketItemMutation = z.infer<typeof basketItemMutationSchema>;
export function basketItemMutationRequest(input: BasketItemMutation, operationId: string) {
  const { basketItemId, ...request } = basketItemMutationSchema.parse(input);
  return {
    path: `/api/customer-mobile/basket/items/${basketItemId}/operations`,
    body: { ...request, operationId: canonicalUuidSchema.parse(operationId) },
  };
}
