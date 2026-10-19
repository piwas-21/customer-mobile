import type { CustomerAddress } from '../api/customerAddresses';
export const addressId = (index: number) =>
  `${index.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
export function savedAddress(index = 1, overrides: Partial<CustomerAddress> = {}): CustomerAddress {
  return {
    id: addressId(index),
    label: 'Home',
    addressLine1: 'Rue de la Paix 7',
    addressLine2: 'Floor 2',
    city: 'Geneva',
    state: null,
    postalCode: '1201',
    country: 'CH',
    phone: '+41790000000',
    isDefault: true,
    deliveryInstructions: 'Ring once',
    ...overrides,
  };
}
export const addressPage = (items = [savedAddress()], nextAfterId: string | null = null) => ({
  schemaVersion: 1,
  items,
  nextAfterId,
});
