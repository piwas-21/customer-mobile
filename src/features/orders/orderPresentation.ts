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
export function receiptFormatters(
  value: Pick<OrderReceipt, 'businessTimeZoneId'> & { currency: string | null },
  locale: string,
) {
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: value.businessTimeZoneId,
  });
  const money = value.currency
    ? new Intl.NumberFormat(locale, { style: 'currency', currency: value.currency })
    : undefined;
  return {
    date: (text: string) => date.format(new Date(text)),
    price: (amount: number) => money?.format(amount) ?? '',
  };
}
