import { hostedPaymentPage } from './hostedPaymentPage';
const origin = 'https://checkout.example.test';
const expiry = '2026-10-20T12:00:00Z';
const now = Date.parse('2026-10-20T11:00:00Z');
it('opens only the approved HTTPS hosted page before its original deadline', () => {
  expect(hostedPaymentPage(`${origin}/pay/session?x=1`, expiry, [origin], now)).toBe(
    `${origin}/pay/session?x=1`,
  );
});
it.each([
  'http://checkout.example.test/pay',
  'https://evil.example.test/pay',
  'https://checkout.example.test.evil.test/pay',
  'https://user:secret@checkout.example.test/pay',
  'https://checkout.example.test:8443/pay',
  'https://checkout.example.test/pay#credential',
  'https://checkout.example.test/\\evil',
  'https://checkout.example.test/pay\n',
  'https://checkout.example.test/pay\t',
  'https://checkout.example.test/pay\u007f',
  'https://checkout.example.test/pay' + 'x'.repeat(8192),
  'not a URL',
])('refuses unsafe page %s', (page) => {
  expect(() => hostedPaymentPage(page, expiry, [origin], now)).toThrow();
});
it.each([now + 3_600_000, now + 3_600_001])(
  'local deadline disables opening without releasing pending at %s',
  (time) => {
    expect(() => hostedPaymentPage(origin, expiry, [origin], time)).toThrow();
  },
);
it('requires explicit valid approved origins and a finite expiry', () => {
  expect(() => hostedPaymentPage(origin, expiry, [], now)).toThrow();
  expect(() => hostedPaymentPage(origin, expiry, ['http://invalid.example.test'], now)).toThrow();
  expect(() => hostedPaymentPage(origin, 'invalid', [origin], now)).toThrow();
});
