import { z } from 'zod';
import { canonicalUuidSchema } from '../core/identifiers';
import { checkoutItemsSchema } from './checkoutComposition';
import { checkoutMoneySchema } from './checkoutMoney';
export const checkoutChannelSchema = z.enum(['Takeaway', 'Delivery']);
export const checkoutFingerprintSchema = z.string().regex(/^[a-fA-F0-9]{64}$/);
export const checkoutQuoteSchema = z.object({
  schemaVersion: z.literal(1),
  basketId: canonicalUuidSchema,
  purchaseFingerprint: checkoutFingerprintSchema,
  quoteFingerprint: checkoutFingerprintSchema,
  type: checkoutChannelSchema,
  currency: z.string().regex(/^[A-Z]{3}$/),
  priceChanged: z.boolean(),
  money: checkoutMoneySchema,
  items: checkoutItemsSchema,
  availablePaymentMethods: z
    .array(z.enum(['Cash', 'CreditCard', 'OnlinePayment']))
    .min(1)
    .max(3)
    .refine((methods) => new Set(methods).size === methods.length),
});
export type CheckoutQuote = z.infer<typeof checkoutQuoteSchema>;
