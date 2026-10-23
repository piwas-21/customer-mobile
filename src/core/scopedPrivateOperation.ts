import { principalSchema, type Principal } from './credentials';
import type { TenantContext } from './tenantContext';
import { ApiFailure } from './apiFailure';
type ScopedRecord = { environment: string; tenantId: string; principal: Principal };
export function scopedPrivateOperation<T extends ScopedRecord>(
  context: TenantContext,
  principal: Principal,
  value: unknown,
  parse: (value: unknown) => T,
) {
  const owner = principalSchema.parse(principal);
  const record = parse(value);
  if (
    record.environment !== context.environment ||
    record.tenantId !== context.tenant.id ||
    record.principal.kind !== owner.kind ||
    record.principal.id !== owner.id
  )
    throw new ApiFailure(403, 'refused');
  return record;
}
