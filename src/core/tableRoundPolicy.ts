import { bootstrapSchema, canUse, type Bootstrap } from './capabilities';
import { ApiFailure } from './apiFailure';
import type { Principal } from './credentials';
import type { TenantContext } from './tenantContext';

export function requireTableRoundEnabled(
  context: TenantContext,
  input: Bootstrap,
  principal: Principal,
) {
  const bootstrap = bootstrapSchema.parse(input);
  if (
    context.tenant.status !== 'active' ||
    bootstrap.tenantId !== context.tenant.id ||
    !canUse(bootstrap, 'ordering') ||
    !canUse(bootstrap, 'table-visits') ||
    bootstrap.flags.tableGuestVisitsV1 !== true ||
    (principal.kind === 'customer' && !canUse(bootstrap, 'accounts')) ||
    !bootstrap.currency
  )
    throw new ApiFailure(409, 'refused');
  return bootstrap;
}
