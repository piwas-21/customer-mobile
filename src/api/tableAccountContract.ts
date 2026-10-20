import { z } from 'zod';
import { canonicalUuidSchema } from '../core/identifiers';
import { utcSortMarkerSchema } from '../core/utcSortMarker';
import { checkoutAmount, checkoutMoney } from './checkoutMoney';
import { tableAccountItemSchema } from './tableAccountItem';
// Revisions must remain exact JavaScript integers; never round a database bigint.
export const tableAccountRevision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const businessDate = z.iso.date();
const displayIdentity = {
  orderId: canonicalUuidSchema,
  orderNumber: z.string(),
  dailyOrderNumber: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  businessDate,
};
export const tableGuestOrderSchema = z.strictObject({
  ...displayIdentity,
  status: z.string(),
  paymentStatus: z.string(),
  orderDate: utcSortMarkerSchema,
  total: checkoutMoney,
  totalPaid: checkoutMoney,
  remainingAmount: checkoutAmount,
  payableTotal: checkoutMoney.optional(),
  billingCreditAmount: checkoutMoney.optional(),
});
export const tableAccountLineSchema = z.strictObject({
  ...displayIdentity,
  unitCount: z.int32().nonnegative(),
  item: tableAccountItemSchema,
});
export const tableAccountSchema = z
  .strictObject({
    serviceSessionId: canonicalUuidSchema,
    tableLabel: z.string().nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    accountRevision: tableAccountRevision,
    subTotal: checkoutMoney,
    tax: checkoutMoney,
    discount: checkoutMoney,
    tip: checkoutMoney,
    total: checkoutMoney,
    totalPaid: checkoutMoney,
    remaining: checkoutAmount,
    credit: checkoutMoney,
    originalTotal: checkoutMoney.optional(),
    billingCreditAmount: checkoutMoney.optional(),
    orders: z.array(tableGuestOrderSchema),
    items: z.array(tableAccountLineSchema),
  })
  .superRefine((account, context) => {
    const orders = new Map(account.orders.map((order) => [order.orderId, order]));
    if (orders.size !== account.orders.length)
      context.addIssue({ code: 'custom', message: 'Duplicate table order' });
    const items = new Set<string>();
    for (const line of account.items) {
      const order = orders.get(line.orderId);
      const key = line.orderId + '/' + line.item.itemId;
      if (
        !order ||
        items.has(key) ||
        line.orderNumber !== order.orderNumber ||
        line.dailyOrderNumber !== order.dailyOrderNumber ||
        line.businessDate !== order.businessDate
      )
        context.addIssue({ code: 'custom', message: 'Unbound table account line' });
      items.add(key);
    }
  });
export type TableAccount = z.infer<typeof tableAccountSchema>;
