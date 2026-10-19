import { z } from 'zod';
import { canonicalUuidSchema } from '../core/identifiers';
import {
  assertOrderProofScope,
  orderOperationProofSchema,
  type OrderOperationProof,
} from '../core/orderOperationProof';
import type { TenantContext } from '../core/tenantContext';
import { ApiFailure, type CustomerTransport } from '../core/transport';
import { checkoutIntentSchema, type CheckoutIntent } from './checkoutIntent';
const resolutionSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    operationId: canonicalUuidSchema,
    outcome: z.enum(['Applied', 'Unseen', 'Cancelled']),
    orderId: canonicalUuidSchema.nullable(),
  })
  .refine((result) => (result.outcome === 'Applied') === (result.orderId !== null));
export type CustomerOrderResolution = z.infer<typeof resolutionSchema>;
export async function submitCustomerOrder(
  client: CustomerTransport,
  context: TenantContext,
  pending: OrderOperationProof & { intent: CheckoutIntent },
  assertCurrent: () => void,
  locale: string,
) {
  const { intent: rawIntent, ...rawProof } = pending;
  const proof = orderOperationProofSchema.parse(rawProof);
  const intent = checkoutIntentSchema.parse(rawIntent);
  if (proof.cancellationRequested) throw new ApiFailure(0, 'refused');
  return request(
    client,
    context,
    proof,
    'submit',
    {
      schemaVersion: 1,
      operationId: proof.operationId,
      payloadHash: proof.payloadHash,
      intent,
    },
    assertCurrent,
    locale,
  );
}
export async function recoverCustomerOrder(
  client: CustomerTransport,
  context: TenantContext,
  value: OrderOperationProof,
  assertCurrent: () => void,
  locale: string,
) {
  const proof = orderOperationProofSchema.parse(value);
  return request(
    client,
    context,
    proof,
    proof.cancellationRequested ? 'cancel' : 'recover',
    {
      schemaVersion: 1,
      operationId: proof.operationId,
      payloadHash: proof.payloadHash,
    },
    assertCurrent,
    locale,
  );
}
async function request(
  client: CustomerTransport,
  context: TenantContext,
  proof: OrderOperationProof,
  action: 'submit' | 'recover' | 'cancel',
  body: unknown,
  assertCurrent: () => void,
  locale: string,
) {
  assertOrderProofScope(context, proof);
  assertCurrent();
  const result = await client.request(
    context,
    `/api/customer-mobile/checkout/${action}`,
    resolutionSchema,
    {
      method: 'POST',
      body,
      credentials: 'order',
      principal: proof.principal,
      expectedOrderProof: proof,
      assertCurrent,
      locale,
    },
  );
  assertCurrent();
  if (
    result.operationId !== proof.operationId ||
    (action === 'submit' && result.outcome !== 'Applied') ||
    (action === 'cancel' && result.outcome === 'Unseen')
  )
    throw new ApiFailure(200, 'contract');
  return result;
}
