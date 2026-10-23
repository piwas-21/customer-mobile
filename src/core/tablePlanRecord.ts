import { z } from 'zod';
import { originalOperationProofSchema } from '../api/originalOperationProof';
import { tablePlanIntentSchema } from '../api/tablePlanIntent';
import { tablePlanMoneySchema, requireTablePlanMoney } from '../api/tablePlanMoney';
import { tablePlanResolutionSchema } from '../api/tablePlanResolution';
import { scopedPrivateOperation } from './scopedPrivateOperation';
import { principalSchema, type Principal } from './credentials';
import { environmentSchema } from './directory';
import { canonicalUuidSchema } from './identifiers';
import type { TenantContext } from './tenantContext';
export const tablePlanRecordSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    environment: environmentSchema,
    tenantId: canonicalUuidSchema,
    principal: principalSchema,
    sessionId: canonicalUuidSchema,
    intent: tablePlanIntentSchema,
    proof: originalOperationProofSchema,
    review: tablePlanMoneySchema,
    cancellationRequested: z.boolean(),
    resolution: tablePlanResolutionSchema.nullable(),
  })
  .superRefine((record, issues) => {
    const { intent, proof, resolution } = record;
    if (
      intent.tenantId !== record.tenantId ||
      proof.tenantId !== record.tenantId ||
      proof.operationId !== intent.operationId ||
      (resolution &&
        (resolution.outcome === 'unseen' ||
          resolution.operationId !== intent.operationId ||
          resolution.serviceSessionId !== intent.serviceSessionId))
    )
      issues.addIssue({ code: 'custom', message: 'Unbound original split record' });
    try {
      requireTablePlanMoney(intent, record.review);
    } catch {
      issues.addIssue({ code: 'custom', message: 'Inconsistent original split money' });
    }
  });
export type TablePlanRecord = z.infer<typeof tablePlanRecordSchema>;
export function scopedTablePlan(context: TenantContext, principal: Principal, value: unknown) {
  return scopedPrivateOperation(context, principal, value, (input) =>
    tablePlanRecordSchema.parse(input),
  );
}
