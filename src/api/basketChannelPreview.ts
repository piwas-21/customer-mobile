import { z } from 'zod';
import { canonicalUuidSchema, emptyUuid } from '../core/identifiers';
import { principalSchema, type Principal } from '../core/credentials';
import { ApiFailure, type CustomerTransport } from '../core/transport';
import type { TenantContext } from '../core/tenantContext';
import { MAX_BASKET_ROWS } from '../domain/basketLimits';
import type { CustomerBasket } from './basketResponse';
import { assertOwnedBasket } from './basketOwnership';
import { orderTypeSchema, orderTypesSchema, type OrderType } from './orderType';
const conflict = z.object({
  basketItemId: canonicalUuidSchema,
  productId: z.uuid().nullish(),
  productName: z.string(),
  quantity: z.int32().positive(),
  allowedOrderTypes: orderTypesSchema,
});
const previewSchema = z.object({
  basketId: z.union([z.literal(emptyUuid), canonicalUuidSchema]),
  purchaseFingerprint: z.string().regex(/^(?:[a-fA-F0-9]{64})?$/),
  orderType: orderTypeSchema,
  conflicts: z
    .array(conflict)
    .max(MAX_BASKET_ROWS)
    .refine((rows) => new Set(rows.map((row) => row.basketItemId)).size === rows.length),
});
export type BasketChannelPreview = z.infer<typeof previewSchema>;
type PreviewRequest = Readonly<{
  principal: Principal;
  sessionId: string;
  reviewed: CustomerBasket;
  orderType: OrderType;
  locale: string;
}>;
export async function readBasketChannelPreview(
  client: CustomerTransport,
  context: TenantContext,
  request: PreviewRequest,
  assertCurrent: () => void,
): Promise<BasketChannelPreview> {
  const { principal, sessionId, reviewed, orderType, locale } = request;
  const owner = Object.freeze(principalSchema.parse(principal));
  const session = canonicalUuidSchema.parse(sessionId);
  const target = orderTypeSchema.parse(orderType);
  assertOwnedBasket(reviewed, owner, session, true);
  const snapshot = {
    id: reviewed.id,
    fingerprint: reviewed.purchaseFingerprint,
    roots: new Map(reviewed.items.map((row) => [row.id, row.quantity])),
  };
  assertCurrent();
  const preview = await client.request(
    context,
    `/api/customer-mobile/basket/channel-preview?orderType=${target}`,
    previewSchema,
    {
      credentials: 'basket',
      principal: owner,
      expectedBasketSessionId: session,
      assertCurrent,
      locale,
    },
  );
  assertCurrent();
  if (
    preview.basketId !== snapshot.id ||
    preview.purchaseFingerprint !== snapshot.fingerprint ||
    preview.orderType !== target ||
    preview.conflicts.some(
      (row) =>
        snapshot.roots.get(row.basketItemId) !== row.quantity ||
        row.allowedOrderTypes.includes(target),
    )
  )
    throw new ApiFailure(200, 'contract');
  return preview;
}
