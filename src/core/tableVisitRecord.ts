import { z } from 'zod';
import { tableVisitIdentitySchema } from '../api/tableVisitContract';
import { canonicalUuidSchema } from './identifiers';
import { principalSchema, type Principal } from './credentials';
import type { TenantContext } from './tenantContext';
import { ApiFailure } from './apiFailure';
export const tableVisitRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  environment: z.enum(['production', 'staging']),
  tenantId: canonicalUuidSchema,
  principal: principalSchema,
  identity: tableVisitIdentitySchema,
});
export type TableVisitRecord = z.infer<typeof tableVisitRecordSchema>;
export function scopedTableVisit(context: TenantContext, principal: Principal, value: unknown) {
  const owner = principalSchema.parse(principal);
  const record = tableVisitRecordSchema.parse(value);
  if (
    record.environment !== context.environment ||
    record.tenantId !== context.tenant.id ||
    record.principal.kind !== owner.kind ||
    record.principal.id !== owner.id
  )
    throw new ApiFailure(403, 'refused');
  return record;
}
