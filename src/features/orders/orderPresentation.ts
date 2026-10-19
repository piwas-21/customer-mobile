import type { OrderReceipt } from '../../api/orderReceipt';
const fulfillment = new Set([
  'Pending',
  'Confirmed',
  'Preparing',
  'Ready',
  'OutForDelivery',
  'Delivered',
  'Completed',
  'Cancelled',
  'Refunded',
  'PendingApproval',
]);
const payments = new Set([
  'Pending',
  'Processing',
  'Completed',
  'Failed',
  'Refunded',
  'PartiallyRefunded',
  'Overpaid',
  'PartiallyPaid',
]);
export function orderStatusKey(value: string, payment: boolean) {
  const known = payment ? payments : fulfillment;
  const group = payment ? 'receiptPayment' : 'receiptStatus';
  if (!known.has(value)) return 'receiptStatusUnknown';
  return `${group}.${value}`;
}
export function receiptFormatters(value: OrderReceipt, locale: string) {
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: value.businessTimeZoneId,
  });
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: value.currency });
  return {
    date: (text: string) => date.format(new Date(text)),
    price: (amount: number) => money.format(amount),
  };
}
