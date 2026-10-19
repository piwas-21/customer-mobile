import { decisionProof, scopedOrderDecisions } from './orderDecisions';
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
  if (!['order', 'order-receipt', 'receipt-renewal'].includes(options.credentials ?? 'none')) {
    if (options.expectedOrderProof !== undefined) throw new ApiFailure(401, 'refused');
    return null;
  }
  const proof = orderOperationProofSchema.parse(options.expectedOrderProof);
  assertOrderProofScope(context, proof);
  if (options.credentials === 'receipt-renewal' && proof.principal.kind !== 'customer')
    throw new ApiFailure(401, 'refused');
  if (
    proof.principal.kind !== options.principal?.kind ||
    proof.principal.id !== options.principal?.id
  )
    throw new ApiFailure(401, 'refused');
  return proof;
}
export async function orderRequestHeaders(
  context: TenantContext,
  vault: CredentialVault,
  expected: OrderOperationProof,
  receipt = false,
) {
  let proof: OrderOperationProof;
  if (receipt) {
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
