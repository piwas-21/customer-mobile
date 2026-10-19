import { z } from 'zod';
import { canonicalUuidSchema } from '../core/identifiers';
import { orderDecisionSchema, decisionProof, type OrderDecision } from '../core/orderDecisions';
import { assertOrderProofScope } from '../core/orderOperationProof';
import type { CustomerTransport } from '../core/transport';
import type { TenantContext } from '../core/tenantContext';
import { checkoutAmount, checkoutMoney, checkoutMoneySchema } from './checkoutMoney';
import { receiptItemsSchema } from './checkoutComposition';
import { orderTypeSchema } from './orderType';
const moment = z.iso.datetime({ offset: true });
export const orderReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  orderId: canonicalUuidSchema,
  orderNumber: z.string().min(1).max(20),
  type: orderTypeSchema,
  orderDate: moment,
  status: z.string().min(1).max(64),
  paymentStatus: z.string().min(1).max(64),
  currency: z.string().regex(/^[A-Z]{3}$/),
  businessTimeZoneId: z.string().refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }),
  expectedReadyAt: moment.nullable(),
  estimatedDeliveryTime: moment.nullable(),
  confirmationFlow: z.string().min(1).max(64),
  reviewDeadlineUtc: moment.nullable(),
  money: checkoutMoneySchema,
  payableTotal: checkoutMoney,
  billingCreditAmount: checkoutMoney,
  billChargeAmount: checkoutMoney,
  totalPaid: checkoutMoney,
  remainingAmount: checkoutAmount,
  items: receiptItemsSchema,
});
export type OrderReceipt = z.infer<typeof orderReceiptSchema>;
export async function readOrderReceipt(
  client: CustomerTransport,
  context: TenantContext,
  saved: OrderDecision,
  assertCurrent: () => void,
  locale: string,
): Promise<OrderReceipt> {
  const decision = orderDecisionSchema.parse(saved);
  const proof = decisionProof(decision);
  assertOrderProofScope(context, proof);
  assertCurrent();
  if (decision.outcome !== 'Applied' || !decision.orderId)
    throw new Error('This attempt has no accepted order');
  const result = await client.request(
    context,
    '/api/customer-mobile/orders/receipt',
    orderReceiptSchema,
    {
      method: 'POST',
      body: { schemaVersion: 1, operationId: proof.operationId, payloadHash: proof.payloadHash },
      credentials: 'order-receipt',
      principal: proof.principal,
      expectedOrderProof: proof,
      assertCurrent,
      locale,
    },
  );
  assertCurrent();
  if (result.orderId !== decision.orderId) throw new Error('Order receipt identity changed');
  return result;
}
