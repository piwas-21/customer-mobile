import { z } from 'zod';
import { canonicalUuidSchema } from '../core/identifiers';
import { tableAccountRevision } from './tableAccountContract';
export const tablePlanIntentSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    tenantId: canonicalUuidSchema,
    operationId: canonicalUuidSchema,
    serviceSessionId: canonicalUuidSchema,
    expectedAccountRevision: tableAccountRevision,
    shareCount: z.number().int().min(2).max(100),
    customAmountsMinor: z.array(z.number().int().min(1).max(9_999_999_999)).max(100),
    supersedesPlanId: canonicalUuidSchema.nullable(),
  })
  .refine(
    (value) =>
      value.customAmountsMinor.length === 0 || value.customAmountsMinor.length === value.shareCount,
  );
export type TablePlanIntent = z.infer<typeof tablePlanIntentSchema>;
