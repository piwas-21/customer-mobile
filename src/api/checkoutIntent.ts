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
  pointsToRedeem: 10,
  notes: 1000,
} as const;
// FluentValidation bounds checkout strings in UTF-16 units, unlike current Zod's
// code-point string max. Keep this wire limit explicit after normalization.
function checkoutText(schema: z.ZodType<string>, maximum: number) {
  return schema.refine((value) => value.length <= maximum);
}
export const checkoutContactSchema = z.strictObject({
  name: checkoutText(z.string().trim().min(1), checkoutInputLimits.name),
  email: checkoutText(z.email(), checkoutInputLimits.email),
  phone: checkoutText(z.string().trim().min(1), checkoutInputLimits.phone),
});
export const checkoutAddressSchema = z.strictObject({
  street: checkoutText(z.string().trim().min(1), checkoutInputLimits.street),
  city: checkoutText(z.string().trim().min(1), checkoutInputLimits.city),
  postalCode: checkoutText(z.string().trim().min(1), checkoutInputLimits.postalCode),
  country: checkoutText(z.string(), checkoutInputLimits.country),
  additionalInfo: checkoutText(z.string(), checkoutInputLimits.additionalInfo)
    .nullable()
    .optional(),
});
export const checkoutIntentSchema = z
  .strictObject({
    review: checkoutReviewSchema,
    expectedQuoteFingerprint: checkoutFingerprintSchema,
    contact: checkoutContactSchema,
    paymentMethod: z.enum(['Cash', 'CreditCard', 'OnlinePayment']),
    address: checkoutAddressSchema.nullable().optional(),
    notes: checkoutText(z.string(), checkoutInputLimits.notes).nullable().optional(),
  })
  .refine((intent) => (intent.review.type === 'Delivery') === (intent.address != null))
  .refine((intent) => intent.review.type !== 'Delivery' || intent.paymentMethod !== 'CreditCard');
export type CheckoutIntent = z.infer<typeof checkoutIntentSchema>;
export const orderPayloadHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
