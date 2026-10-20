import { z } from 'zod';
import {
  bindCancellationResolution,
  cancellationIntentSchema,
  cancellationResolutionSchema,
} from '../api/orderCancellationContract';
import { principalSchema, type Principal } from './credentials';
import { canonicalUuidSchema } from './identifiers';
import { environmentSchema } from './directory';
import { orderOperationProofSchema } from './orderOperationProof';
import type { TenantContext } from './tenantContext';
export const cancellationAuthoritySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('customer') }),
  z.strictObject({ kind: z.literal('original'), proof: orderOperationProofSchema }),
]);
export const cancellationOperationRecordSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    environment: environmentSchema,
    tenantId: canonicalUuidSchema,
    principal: principalSchema,
    authority: cancellationAuthoritySchema,
    intent: cancellationIntentSchema,
    recordedAt: z.iso.datetime().max(64),
    resolution: cancellationResolutionSchema.nullable(),
  })
  .refine((record) => {
    if (record.authority.kind === 'customer') {
      if (record.principal.kind !== 'customer') return false;
    } else {
      const proof = record.authority.proof;
      if (
        proof.environment !== record.environment ||
        proof.tenantId !== record.tenantId ||
        proof.principal.kind !== record.principal.kind ||
        proof.principal.id !== record.principal.id
      )
        return false;
    }
    if (record.resolution === null) return true;
    try {
      bindCancellationResolution(record.intent, record.resolution, 'submit');
      return true;
    } catch {
      return false;
    }
  });
export type CancellationAuthority = z.infer<typeof cancellationAuthoritySchema>;
export type CancellationOperationRecord = z.infer<typeof cancellationOperationRecordSchema>;
function retainedRecord(
  context: TenantContext,
  principal: Principal,
  value: unknown,
): CancellationOperationRecord {
  const record = cancellationOperationRecordSchema.parse(value);
  if (
    record.environment !== context.environment ||
    record.tenantId !== context.tenant.id ||
    record.principal.kind !== principal.kind ||
    record.principal.id !== principal.id
  )
    throw new Error('Cancellation owner changed');
  return record;
}
export function scopedCancellationRecord(
  context: TenantContext,
  principal: Principal,
  value: unknown,
): CancellationOperationRecord {
  if (context.signal.aborted) throw new Error('Restaurant changed');
  return retainedRecord(context, principal, value);
}
// Logout may finish after restaurant withdrawal. This validates the captured storage owner,
// never supplies network authority, and must not turn an aborted request into a live one.
export const cancellationRecordForCleanup = retainedRecord;
