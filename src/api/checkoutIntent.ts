import { z } from 'zod';
import { checkoutReviewSchema } from './checkoutReview';
import { checkoutFingerprintSchema } from './checkoutQuoteResponse';
// Current order/order-address storage and native wire limits.
export const checkoutInputLimits = {
  name: 100,
  email: 100,
  phone: 20,
  street: 200,
  city: 100,
  postalCode: 20,
  country: 100,
  additionalInfo: 500,
  tip: 11,
  notes: 1000,
} as const;
export const checkoutContactSchema = z.strictObject({
  name: z.string().trim().min(1).max(checkoutInputLimits.name),
  email: z.email().max(checkoutInputLimits.email),
  phone: z.string().trim().min(1).max(checkoutInputLimits.phone),
});
export const checkoutAddressSchema = z.strictObject({
  street: z.string().trim().min(1).max(checkoutInputLimits.street),
  city: z.string().trim().min(1).max(checkoutInputLimits.city),
  postalCode: z.string().trim().min(1).max(checkoutInputLimits.postalCode),
  country: z.string().max(checkoutInputLimits.country),
  additionalInfo: z.string().max(checkoutInputLimits.additionalInfo).nullable().optional(),
});
export const checkoutIntentSchema = z
  .strictObject({
    review: checkoutReviewSchema,
    expectedQuoteFingerprint: checkoutFingerprintSchema,
    contact: checkoutContactSchema,
    paymentMethod: z.enum(['Cash', 'CreditCard', 'OnlinePayment']),
    address: checkoutAddressSchema.nullable().optional(),
    notes: z.string().max(checkoutInputLimits.notes).nullable().optional(),
  })
  .refine((intent) => (intent.review.type === 'Delivery') === (intent.address != null))
  .refine((intent) => intent.review.type !== 'Delivery' || intent.paymentMethod !== 'CreditCard');
export type CheckoutIntent = z.infer<typeof checkoutIntentSchema>;
export const orderPayloadHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
