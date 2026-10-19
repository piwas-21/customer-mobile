import type { CustomerAddress } from '../api/customerAddresses';
import type { CheckoutDraft } from './checkoutDraft';
import type { CheckoutFields } from './checkoutFields';
// Keep every saved delivery detail visible for review, even when the combined value
// exceeds checkout storage limits. The existing checkout validator then blocks review.
export function applyCheckoutAddress(
  draft: CheckoutDraft,
  address: CustomerAddress,
): CheckoutDraft {
  return {
    ...draft,
    street: [address.addressLine1, address.addressLine2].filter(Boolean).join('\n'),
    city: [address.city, address.state].filter(Boolean).join(', '),
    postalCode: address.postalCode,
    country: address.country,
    additionalInfo: address.deliveryInstructions ?? '',
    phone: address.phone?.trim() ? address.phone : draft.phone,
  };
}

export function checkoutDraftFields(fields: CheckoutFields, draft: CheckoutDraft): CheckoutFields {
  if (!fields.address.length) return fields;
  const visible = new Set(fields.address.map((field) => field.key));
  const imported = (['country', 'additionalInfo'] as const)
    .filter((key) => !visible.has(key) && draft[key].length > 0)
    .map((key) => ({ key, required: false }));
  return { ...fields, address: [...fields.address, ...imported] };
}
