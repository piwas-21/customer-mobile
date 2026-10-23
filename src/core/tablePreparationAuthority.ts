import { z } from 'zod';
import { tablePaymentCurrency } from '../domain/tablePaymentMoney';
import { environmentSchema } from './directory';
import { principalSchema, type Principal } from './credentials';
import { canonicalUuidSchema } from './identifiers';
import { tableVisitRecordSchema, type TableVisitRecord } from './tableVisitRecord';
import { ApiFailure } from './apiFailure';
import type { TenantContext } from './tenantContext';
export const tablePreparationFields = {
  schemaVersion: z.literal(1),
  environment: environmentSchema,
  tenantId: canonicalUuidSchema,
  principal: principalSchema,
  sessionId: canonicalUuidSchema,
  visit: tableVisitRecordSchema,
  currency: tablePaymentCurrency,
};
type Candidate = {
  environment: string;
  tenantId: string;
  principal: Principal;
  visit: TableVisitRecord;
  intent: { tenantId: string; serviceSessionId: string };
};
export function tablePreparationBound(value: Candidate) {
  return (
    value.intent.tenantId === value.tenantId &&
    value.visit.tenantId === value.tenantId &&
    value.visit.environment === value.environment &&
    value.visit.principal.kind === value.principal.kind &&
    value.visit.principal.id === value.principal.id &&
    value.visit.identity.serviceSessionId === value.intent.serviceSessionId
  );
}
export function scopedTablePreparation<T extends Candidate>(
  context: TenantContext,
  principal: Principal,
  value: unknown,
  parse: (value: unknown) => T,
) {
  const owner = principalSchema.parse(principal);
  const prepared = parse(value);
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
