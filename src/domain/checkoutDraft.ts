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
export function inspectCheckoutDraft(draft: CheckoutDraft, fields: CheckoutFields) {
  const errors = new Set<keyof CheckoutDraft>();
  const contact = checkoutContactSchema.safeParse({
    name: draft.name,
    email: draft.email,
    phone: draft.phone,
  });
  if (!contact.success)
    for (const issue of contact.error.issues) errors.add(issue.path[0] as keyof CheckoutDraft);
  const address = fields.address.length
    ? checkoutAddressSchema.safeParse({
        street: draft.street,
        city: draft.city,
        postalCode: draft.postalCode,
        country: draft.country,
        additionalInfo: draft.additionalInfo,
      })
    : null;
  if (address && !address.success)
    for (const issue of address.error.issues) errors.add(issue.path[0] as keyof CheckoutDraft);
  for (const field of [...fields.contact, ...fields.address])
    if (field.required && !draft[field.key].trim()) errors.add(field.key);
  const text = draft.tip.trim();
  const amount = text === '' ? 0 : Number(text.replace(',', '.'));
  const tip = checkoutMoney.safeParse(amount);
  if ((text !== '' && !/^\d+(?:[.,]\d{1,2})?$/.test(text)) || !tip.success) errors.add('tip');
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
