import { z } from 'zod';
import { canonicalUuidSchema } from './identifiers';
import { orderOperationProofSchema, assertOrderProofScope } from './orderOperationProof';
import type { Principal } from './credentials';
import type { TenantContext } from './tenantContext';
export const paymentOperationRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  proof: orderOperationProofSchema.extend({ onlinePayment: z.literal(true) }),
  orderId: canonicalUuidSchema,
  state: z.enum(['pending', 'paid', 'expired', 'failed']),
  createdAt: z.iso.datetime().max(64),
  expiresAt: z.iso.datetime({ offset: true }).max(64).nullable(),
});
export type PaymentOperationRecord = z.infer<typeof paymentOperationRecordSchema>;
export function scopedPaymentRecord(
  context: TenantContext,
  principal: Principal,
  value: unknown,
): PaymentOperationRecord {
  const record = paymentOperationRecordSchema.parse(value);
  assertOrderProofScope(context, record.proof);
  if (record.proof.principal.kind !== principal.kind || record.proof.principal.id !== principal.id)
    throw new Error('Payment owner changed');
  return record;
}
