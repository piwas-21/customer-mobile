import { z } from 'zod';
import { canonicalUuidSchema } from '../core/identifiers';
import { checkoutMoney } from './checkoutMoney';
import { checkoutChannelSchema, checkoutFingerprintSchema } from './checkoutQuoteResponse';
export const checkoutReviewSchema = z.strictObject({
  schemaVersion: z.literal(1),
  expectedBasketId: canonicalUuidSchema,
  expectedPurchaseFingerprint: checkoutFingerprintSchema,
  type: checkoutChannelSchema,
  pointsToRedeem: z.int32().nonnegative(),
  tip: checkoutMoney,
});
