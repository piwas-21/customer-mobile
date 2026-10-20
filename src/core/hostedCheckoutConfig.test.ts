import { hostedCheckoutOrigins } from './hostedCheckoutConfig';
it('requires explicit approved origins and freezes the reviewed configuration', () => {
  expect(hostedCheckoutOrigins(undefined)).toEqual([]);
  const origins = hostedCheckoutOrigins('["https://checkout.example.test"]');
  expect(origins).toEqual(['https://checkout.example.test']);
  expect(Object.isFrozen(origins)).toBe(true);
});
it.each([
  'invalid',
  '{}',
  '["http://checkout.example.test"]',
  '["https://checkout.example.test/path"]',
  '["https://checkout.example.test","https://checkout.example.test"]',
  JSON.stringify(Array.from({ length: 11 }, (_, i) => `https://checkout${i}.example.test`)),
])('rejects invalid or ambiguous config %s', (value) => {
  expect(() => hostedCheckoutOrigins(value)).toThrow();
});
