import {
  checkoutAddressSchema,
  checkoutContactSchema,
  checkoutIntentSchema,
} from './checkoutIntent';
import { checkoutIntent } from '../test/customerOrder';
const contact = { name: 'Customer', email: 'customer@example.test', phone: '+41000000000' };
const address = {
  street: 'Street',
  city: 'City',
  postalCode: '1201',
  country: 'CH',
  additionalInfo: '',
};
it.each([
  ['name', 50],
  ['phone', 10],
] as const)(
  'uses the server UTF-16 boundary for contact %s rather than code-point count',
  (field, pairs) => {
    expect(
      checkoutContactSchema.safeParse({ ...contact, [field]: '🍜'.repeat(pairs) }).success,
    ).toBe(true);
    expect(
      checkoutContactSchema.safeParse({ ...contact, [field]: '🍜'.repeat(pairs) + 'x' }).success,
    ).toBe(false);
  },
);
it.each([
  ['street', 100],
  ['city', 50],
  ['postalCode', 10],
  ['country', 50],
  ['additionalInfo', 250],
] as const)('uses the server UTF-16 boundary for address %s without truncation', (field, pairs) => {
  const value = '🍜'.repeat(pairs);
  expect(checkoutAddressSchema.parse({ ...address, [field]: value })[field]).toBe(value);
  expect(checkoutAddressSchema.safeParse({ ...address, [field]: value + 'x' }).success).toBe(false);
});
it('retains the normalized contact and independent email wire boundary', () => {
  expect(
    checkoutContactSchema.parse({ ...contact, name: '  Customer  ', phone: '  +41000000000  ' }),
  ).toEqual(contact);
  const email = 'a'.repeat(64) + '@' + 'b'.repeat(30) + '.test';
  expect(email).toHaveLength(100);
  expect(checkoutContactSchema.safeParse({ ...contact, email }).success).toBe(true);
  expect(checkoutContactSchema.safeParse({ ...contact, email: email + 'x' }).success).toBe(false);
});
it('checks supplementary Unicode notes at the current server maximum', () => {
  const intent = checkoutIntent();
  expect(checkoutIntentSchema.safeParse({ ...intent, notes: '🍜'.repeat(500) }).success).toBe(true);
  expect(checkoutIntentSchema.safeParse({ ...intent, notes: '🍜'.repeat(500) + 'x' }).success).toBe(
    false,
  );
});
