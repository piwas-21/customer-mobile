import { bootstrapSchema, canUse, type Bootstrap } from './capabilities';
import type { Principal } from './credentials';
import type { TenantContext } from './tenantContext';
import { ApiFailure } from './apiFailure';
export function requireTableContributionEnabled(
  context: TenantContext,
  value: Bootstrap,
  principal: Principal,
) {
  const bootstrap = bootstrapSchema.parse(value);
  if (
    context.tenant.status !== 'active' ||
    bootstrap.tenantId !== context.tenant.id ||
    !canUse(bootstrap, 'table-payments') ||
    !canUse(bootstrap, 'table-visits') ||
    bootstrap.flags.tableGuestVisitsV1 !== true ||
    bootstrap.flags.tableAccountPaymentsV1 !== true ||
    bootstrap.flags.tableGuestAccountPaymentsV1 !== true ||
    !bootstrap.currency ||
    (principal.kind === 'customer' && !canUse(bootstrap, 'accounts'))
  )
    throw new ApiFailure(409, 'refused');
  return bootstrap;
}
