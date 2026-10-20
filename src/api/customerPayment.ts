import { customerPaymentDecisionSchema } from './customerPaymentDecision';
import { scopedPaymentRecord, type PaymentOperationRecord } from '../core/paymentOperationRecord';
import type { TenantContext } from '../core/tenantContext';
import { ApiFailure, type CustomerTransport } from '../core/transport';
export async function recoverCustomerPayment(
  client: CustomerTransport,
  context: TenantContext,
  saved: PaymentOperationRecord,
  assertCurrent: () => void,
  locale: string,
) {
  const record = scopedPaymentRecord(context, saved.proof.principal, saved);
  const proof = record.proof;
  assertCurrent();
  const result = await client.request(
    context,
    '/api/customer-mobile/checkout/payment/recover',
    customerPaymentDecisionSchema,
    {
      method: 'POST',
      credentials: 'order-payment',
      principal: proof.principal,
      expectedOrderProof: proof,
      expectedPaymentOrderId: record.orderId,
      body: { schemaVersion: 1, operationId: proof.operationId, payloadHash: proof.payloadHash },
      assertCurrent,
      locale,
    },
  );
  assertCurrent();
  if (
    result.operationId !== proof.operationId ||
    result.orderId !== record.orderId ||
    (record.expiresAt !== null && result.expiresAt !== record.expiresAt)
  )
    throw new ApiFailure(200, 'contract');
  return result;
}
