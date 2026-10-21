import { z } from 'zod';
import { tableRoundIntentSchema } from '../api/tableRoundContract';
import { environmentSchema } from './directory';
import { principalSchema, type Principal } from './credentials';
import { canonicalUuidSchema } from './identifiers';
import { tableVisitRecordSchema } from './tableVisitRecord';
import { ApiFailure } from './apiFailure';
import type { TenantContext } from './tenantContext';

export const tableRoundPreparationSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    environment: environmentSchema,
    tenantId: canonicalUuidSchema,
    principal: principalSchema,
    sessionId: canonicalUuidSchema,
    visit: tableVisitRecordSchema,
    intent: tableRoundIntentSchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .refine(
    (record) =>
      record.intent.tenantId === record.tenantId &&
      record.visit.tenantId === record.tenantId &&
      record.visit.environment === record.environment &&
      record.visit.principal.kind === record.principal.kind &&
      record.visit.principal.id === record.principal.id &&
      record.visit.identity.serviceSessionId === record.intent.serviceSessionId,
  );
export type TableRoundPreparation = z.infer<typeof tableRoundPreparationSchema>;
export function scopedRoundPreparation(
  context: TenantContext,
  principal: Principal,
  value: unknown,
) {
  const owner = principalSchema.parse(principal);
  const record = tableRoundPreparationSchema.parse(value);
  if (
    context.signal.aborted ||
    context.tenant.status !== 'active' ||
    record.environment !== context.environment ||
    record.tenantId !== context.tenant.id ||
    record.principal.kind !== owner.kind ||
    record.principal.id !== owner.id ||
    Date.parse(record.visit.identity.expiresAt) <= Date.now()
  )
    throw new ApiFailure(409, 'refused');
  return record;
}
