import { decisionProof, scopedOrderDecisions } from './orderDecisions';
import { scopedPaymentRecord } from './paymentOperationRecord';
import { canonicalUuidSchema } from './identifiers';
import type { CredentialVault } from './credentials';
import { ApiFailure } from './apiFailure';
import type { RequestOptions } from './httpTypes';
import {
  assertOrderProofScope,
  orderOperationProofSchema,
  type OrderOperationProof,
} from './orderOperationProof';
import type { TenantContext } from './tenantContext';
export function captureOrderProof(
  context: TenantContext,
  options: RequestOptions,
): OrderOperationProof | null {
  if (options.credentials === 'order-payment' || options.credentials === 'payment-renewal') {
    if (!canonicalUuidSchema.safeParse(options.expectedPaymentOrderId).success)
      throw new ApiFailure(401, 'refused');
  } else if (options.expectedPaymentOrderId !== undefined) throw new ApiFailure(401, 'refused');
  if (
    !['order', 'order-receipt', 'receipt-renewal', 'order-payment', 'payment-renewal'].includes(
      options.credentials ?? 'none',
    )
  ) {
    if (options.expectedOrderProof !== undefined) throw new ApiFailure(401, 'refused');
    return null;
  }
  const proof = orderOperationProofSchema.parse(options.expectedOrderProof);
  assertOrderProofScope(context, proof);
  if (
    (options.credentials === 'receipt-renewal' || options.credentials === 'payment-renewal') &&
    proof.principal.kind !== 'customer'
  )
    throw new ApiFailure(401, 'refused');
  if (
    proof.principal.kind !== options.principal?.kind ||
    proof.principal.id !== options.principal?.id
  )
    throw new ApiFailure(401, 'refused');
  return proof;
}
export type OrderProofSource = 'pending' | 'receipt' | 'payment';
export async function orderRequestHeaders(
  context: TenantContext,
  vault: CredentialVault,
  expected: OrderOperationProof,
  source: OrderProofSource = 'pending',
  paymentOrderId?: string,
) {
  let proof: OrderOperationProof;
  if (source === 'payment') {
    const raw = await vault.capability(context, 'payment', expected.principal);
    if (raw === null) throw new ApiFailure(401, 'refused');
    const record = scopedPaymentRecord(context, expected.principal, JSON.parse(raw));
    if (record.orderId !== paymentOrderId) throw new ApiFailure(401, 'refused');
    proof = record.proof;
  } else if (source === 'receipt') {
    const value = await vault.orderReceiptRecords(context, expected.principal);
    const decisions = scopedOrderDecisions(
      context,
      expected.principal,
      value === null ? [] : JSON.parse(value),
    );
    const decision = decisions.find(
      (value) => value.operationId === expected.operationId && value.outcome === 'Applied',
    );
    if (!decision) throw new ApiFailure(401, 'refused');
    proof = decisionProof(decision);
  } else {
    const value = await vault.capability(context, 'order-operation-proof', expected.principal);
    if (value === null) throw new ApiFailure(401, 'refused');
    proof = orderOperationProofSchema.parse(JSON.parse(value));
  }
  assertOrderProofScope(context, proof);
  if (JSON.stringify(proof) !== JSON.stringify(expected)) throw new ApiFailure(401, 'refused');
  return { 'X-Session-Id': proof.sessionId };
}
