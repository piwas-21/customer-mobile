import { z } from 'zod';
import { tablePaymentIntentSchema } from '../api/tablePaymentIntent';
import { tablePaymentCurrency } from '../domain/tablePaymentMoney';
import { environmentSchema } from './directory';
import { principalSchema, type Principal } from './credentials';
import { canonicalUuidSchema } from './identifiers';
import { tableVisitRecordSchema } from './tableVisitRecord';
import { ApiFailure } from './apiFailure';
import type { TenantContext } from './tenantContext';
export const tablePaymentPreparationSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    environment: environmentSchema,
    tenantId: canonicalUuidSchema,
    principal: principalSchema,
    sessionId: canonicalUuidSchema,
    visit: tableVisitRecordSchema,
    intent: tablePaymentIntentSchema,
    currency: tablePaymentCurrency,
  })
  .refine(
    (value) =>
      value.intent.tenantId === value.tenantId &&
      value.visit.tenantId === value.tenantId &&
      value.visit.environment === value.environment &&
      value.visit.principal.kind === value.principal.kind &&
      value.visit.principal.id === value.principal.id &&
      value.visit.identity.serviceSessionId === value.intent.serviceSessionId,
  );
export type TablePaymentPreparation = z.infer<typeof tablePaymentPreparationSchema>;
export function scopedTablePaymentPreparation(
  context: TenantContext,
  principal: Principal,
  value: unknown,
) {
  const owner = principalSchema.parse(principal);
  const prepared = tablePaymentPreparationSchema.parse(value);
  if (
    context.signal.aborted ||
    context.tenant.status !== 'active' ||
    prepared.environment !== context.environment ||
    prepared.tenantId !== context.tenant.id ||
    prepared.principal.kind !== owner.kind ||
    prepared.principal.id !== owner.id ||
    Date.parse(prepared.visit.identity.expiresAt) <= Date.now()
  )
    throw new ApiFailure(409, 'refused');
  return prepared;
}
