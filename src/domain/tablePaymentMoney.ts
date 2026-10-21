import { z } from 'zod';

// CheckoutAmount's current allow-list contains only currencies with two decimal minor units.
export const tablePaymentCurrency = z.enum(['CHF', 'EUR', 'GBP', 'USD', 'AED']);
export const tablePaymentMinor = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

// Never divide a large safe minor-unit integer into an inexact floating-point major amount.
export function formatTablePaymentMinor(input: number, currency: string, locale: string) {
  const minor = BigInt(tablePaymentMinor.parse(input));
  const code = tablePaymentCurrency.parse(currency);
  const unitsPerMajor = 100n;
  const fraction = new Intl.NumberFormat(locale, {
    minimumIntegerDigits: 2,
    maximumFractionDigits: 0,
    useGrouping: false,
  }).format(Number(minor % unitsPerMajor));
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .formatToParts(minor / unitsPerMajor)
    .map((part) => (part.type === 'fraction' ? fraction : part.value))
    .join('');
}
