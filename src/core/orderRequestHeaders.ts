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
  if (options.credentials !== 'order') {
    if (options.expectedOrderProof !== undefined) throw new ApiFailure(401, 'refused');
    return null;
  }
  const proof = orderOperationProofSchema.parse(options.expectedOrderProof);
  assertOrderProofScope(context, proof);
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
) {
  const value = await vault.capability(context, 'order-operation-proof', expected.principal);
  if (value === null) throw new ApiFailure(401, 'refused');
  const proof = orderOperationProofSchema.parse(JSON.parse(value));
  assertOrderProofScope(context, proof);
  if (JSON.stringify(proof) !== JSON.stringify(expected)) throw new ApiFailure(401, 'refused');
  return { 'X-Session-Id': proof.sessionId };
}
