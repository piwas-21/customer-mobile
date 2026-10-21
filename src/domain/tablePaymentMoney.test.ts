import { formatTablePaymentMinor } from './tablePaymentMoney';
const spaces = (value: string) => value.replace(/[\u00a0\u202f]/g, ' ');
it.each([
  [0, 'CHF 0.00'],
  [1, 'CHF 0.01'],
  [145, 'CHF 1.45'],
  [Number.MAX_SAFE_INTEGER, 'CHF 90,071,992,547,409.91'],
] as const)('formats exact two-decimal server minor units: %s', (minor, expected) => {
  expect(spaces(formatTablePaymentMinor(minor, 'CHF', 'en-US'))).toBe(expected);
});
it('retains localized decimal digits without losing the original minor unit', () => {
  expect(spaces(formatTablePaymentMinor(1, 'CHF', 'fr-FR'))).toBe('0,01 CHF');
  expect(formatTablePaymentMinor(145, 'AED', 'ar-AE-u-nu-arab')).toContain('١٫٤٥');
});
it.each(['JPY', 'BHD', '???'])('refuses an unsupported currency scale: %s', (currency) => {
  expect(() => formatTablePaymentMinor(100, currency, 'en')).toThrow();
});
it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])('refuses an inexact minor amount: %s', (amount) => {
  expect(() => formatTablePaymentMinor(amount, 'CHF', 'en')).toThrow();
});
