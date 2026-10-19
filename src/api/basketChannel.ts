import { z } from 'zod';
import { canonicalUuidSchema, emptyUuid } from '../core/identifiers';
import { MAX_BASKET_ROWS } from '../domain/basketLimits';
import { orderTypeSchema, orderTypesSchema, type OrderType } from './orderType';
import type { CustomerTransport } from '../core/transport';
import type { TenantContext } from '../core/tenantContext';
const ids = z
  .array(canonicalUuidSchema)
  .max(MAX_BASKET_ROWS)
  .refine((values) => new Set(values).size === values.length);
export const basketChannelInputSchema = z
  .object({
    expectedBasketId: z.union([z.literal(emptyUuid), canonicalUuidSchema]),
    expectedPurchaseFingerprint: z.string().regex(/^(?:[a-fA-F0-9]{64})?$/),
    orderType: orderTypeSchema,
    confirmedConflictItemIds: ids,
  })
  .strict()
  .refine((request) =>
    request.expectedBasketId === emptyUuid
      ? request.expectedPurchaseFingerprint === '' && request.confirmedConflictItemIds.length === 0
      : request.expectedPurchaseFingerprint !== '',
  );
export type BasketChannelInput = Readonly<
  Omit<z.infer<typeof basketChannelInputSchema>, 'confirmedConflictItemIds'>
> & { readonly confirmedConflictItemIds: readonly string[] };
export function basketChannelRequest(input: BasketChannelInput, operationId: string) {
  return {
    path: '/api/customer-mobile/basket/channel',
    body: {
      ...basketChannelInputSchema.parse(input),
      operationId: canonicalUuidSchema.parse(operationId),
    },
  };
}
export function readOrderTypes(
  client: CustomerTransport,
  context: TenantContext,
): Promise<OrderType[]> {
  return client.request(context, '/api/OrderTypeConfiguration/enabled', orderTypesSchema);
}
