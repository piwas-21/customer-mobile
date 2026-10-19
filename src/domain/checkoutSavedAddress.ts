import type { CustomerAddress } from '../api/customerAddresses';
import type { CheckoutDraft } from './checkoutDraft';
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
