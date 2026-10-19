import { z } from 'zod';
import { checkoutAddressSchema, checkoutContactSchema } from '../api/checkoutIntent';
import { checkoutMoney } from '../api/checkoutMoney';
import type { CheckoutFields } from './checkoutFields';
export function emptyCheckoutDraft() {
  return {
    name: '',
    email: '',
    phone: '',
    street: '',
    postalCode: '',
    city: '',
    country: '',
    additionalInfo: '',
    tip: '',
  };
}
export type CheckoutDraft = ReturnType<typeof emptyCheckoutDraft>;
const tipSchema = z
  .string()
  .trim()
  .regex(/^(?:\d+(?:[.,]\d{1,2})?)?$/)
  .transform((text) => Number(text.replace(',', '.')))
  .pipe(checkoutMoney);
function collectErrors(
  issues: readonly { path: PropertyKey[] }[],
  errors: Set<keyof CheckoutDraft>,
) {
  for (const issue of issues) errors.add(issue.path[0] as keyof CheckoutDraft);
}
export function inspectCheckoutDraft(draft: CheckoutDraft, fields: CheckoutFields) {
  const errors = new Set<keyof CheckoutDraft>();
  const contact = checkoutContactSchema.safeParse({
    name: draft.name,
    email: draft.email,
    phone: draft.phone,
  });
  if (!contact.success) collectErrors(contact.error.issues, errors);
  const address = fields.address.length
    ? checkoutAddressSchema.safeParse({
        street: draft.street,
        city: draft.city,
        postalCode: draft.postalCode,
        country: draft.country,
        additionalInfo: draft.additionalInfo,
      })
    : null;
  if (address && !address.success) collectErrors(address.error.issues, errors);
  for (const field of [...fields.contact, ...fields.address])
    if (field.required && !draft[field.key].trim()) errors.add(field.key);
  const tip = tipSchema.safeParse(draft.tip);
  if (!tip.success) errors.add('tip');
  return {
    errors,
    values:
      errors.size === 0 && contact.success && (!address || address.success) && tip.success
        ? {
            contact: contact.data,
            address: address?.data,
            tip: tip.data,
          }
        : null,
  };
}
