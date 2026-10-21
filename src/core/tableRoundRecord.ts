import { z } from 'zod';
import { originalOperationProofSchema } from '../api/originalOperationProof';
import { tableRoundIntentSchema, tableRoundResolutionSchema } from '../api/tableRoundContract';
import { ApiFailure } from './apiFailure';
import { principalSchema, type Principal } from './credentials';
import { environmentSchema } from './directory';
import { canonicalUuidSchema } from './identifiers';
import type { TenantContext } from './tenantContext';

// Contains the original no-contact intent and protected proof, never a participant token or quote.
export const tableRoundRecordSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    environment: environmentSchema,
    tenantId: canonicalUuidSchema,
    principal: principalSchema,
    sessionId: canonicalUuidSchema,
    intent: tableRoundIntentSchema,
    proof: originalOperationProofSchema,
    cancellationRequested: z.boolean(),
    resolution: tableRoundResolutionSchema.nullable(),
  })
  .superRefine((record, context) => {
    const { intent, proof, resolution } = record;
    if (
      intent.tenantId !== record.tenantId ||
      proof.tenantId !== record.tenantId ||
      proof.operationId !== intent.operationId ||
      (resolution &&
        (resolution.outcome === 'Unseen' ||
          resolution.operationId !== intent.operationId ||
          resolution.serviceSessionId !== intent.serviceSessionId))
    )
      context.addIssue({ code: 'custom', message: 'Unbound original round record' });
  });
export type TableRoundRecord = z.infer<typeof tableRoundRecordSchema>;
export function scopedTableRound(context: TenantContext, principal: Principal, input: unknown) {
  const owner = principalSchema.parse(principal);
  const record = tableRoundRecordSchema.parse(input);
  if (
    context.signal.aborted ||
    record.environment !== context.environment ||
    record.tenantId !== context.tenant.id ||
    record.principal.kind !== owner.kind ||
    record.principal.id !== owner.id
  )
    throw new ApiFailure(403, 'refused');
  return record;
}
