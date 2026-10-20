import { z } from 'zod';
import { canonicalUuidSchema } from '../core/identifiers';
import type { SessionController } from '../core/sessionController';
import { ApiFailure } from '../core/transport';
import { normalizedUtcSortMarker, utcSortMarkerSchema } from '../core/utcSortMarker';

const recordedPoints = z.number().int().nonnegative().max(2147483647);
export const loyaltyBalanceSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    currentPoints: recordedPoints,
    totalEarnedPoints: recordedPoints,
    totalRedeemedPoints: recordedPoints,
    lastUpdated: utcSortMarkerSchema.nullable(),
  })
  .refine(
    (balance) =>
      balance.lastUpdated !== null ||
      (balance.currentPoints === 0 &&
        balance.totalEarnedPoints === 0 &&
        balance.totalRedeemedPoints === 0),
  );
const cursorSchema = z.strictObject({
  createdAt: utcSortMarkerSchema,
  transactionId: canonicalUuidSchema,
});
export type LoyaltyCursor = z.infer<typeof cursorSchema>;
export const loyaltyMovementSchema = cursorSchema.extend({
  kind: z.enum([
    'earned',
    'redeemed',
    'adjusted',
    'expired',
    'refunded',
    'earned-reversed',
    'redemption-restored',
  ]),
  points: z.number().int().min(-2147483648).max(2147483647),
  expiresAt: utcSortMarkerSchema.nullable(),
});
export type LoyaltyMovement = z.infer<typeof loyaltyMovementSchema>;

export function loyaltyCursorFollows(next: LoyaltyCursor, before: LoyaltyCursor) {
  const date = normalizedUtcSortMarker(next.createdAt);
  const previous = normalizedUtcSortMarker(before.createdAt);
  return date < previous || (date === previous && next.transactionId > before.transactionId);
}
export const loyaltyHistorySchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    items: z.array(loyaltyMovementSchema).max(20),
    next: cursorSchema.nullable(),
  })
  .refine((page) => {
    if (new Set(page.items.map((item) => item.transactionId)).size !== page.items.length)
      return false;
    if (
      page.items.some(
        (item, index) => index > 0 && !loyaltyCursorFollows(item, page.items[index - 1]!),
      )
    )
      return false;
    if (!page.next) return true;
    const last = page.items.at(-1);
    return (
      page.items.length === 20 &&
      last?.transactionId === page.next.transactionId &&
      normalizedUtcSortMarker(last.createdAt) === normalizedUtcSortMarker(page.next.createdAt)
    );
  });

export async function readLoyaltyBalance(controller: SessionController, userId: string) {
  return controller.get(
    userId,
    '/api/customer-mobile/loyalty/balance?schemaVersion=1',
    loyaltyBalanceSchema,
  );
}
export async function readLoyaltyHistory(
  controller: SessionController,
  userId: string,
  before?: LoyaltyCursor,
) {
  const cursor = before === undefined ? undefined : cursorSchema.parse(before);
  const query = cursor
    ? '&beforeCreatedAt=' +
      encodeURIComponent(cursor.createdAt) +
      '&beforeId=' +
      cursor.transactionId
    : '';
  const page = await controller.get(
    userId,
    '/api/customer-mobile/loyalty/history?schemaVersion=1' + query,
    loyaltyHistorySchema,
  );
  if (cursor && page.items.some((item) => !loyaltyCursorFollows(item, cursor)))
    throw new ApiFailure(200, 'contract');
  return page;
}
