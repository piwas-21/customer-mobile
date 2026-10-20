import { readBootstrap } from '../api/bootstrap';
import { canUse, type Bootstrap } from './capabilities';
import type { Principal } from './credentials';
import type { TenantContext } from './tenantContext';
import { ApiFailure, type CustomerTransport } from './transport';
export function canStartReservation(
  context: TenantContext,
  bootstrap: Bootstrap,
  principal: Principal,
) {
  return (
    context.tenant.status === 'active' &&
    bootstrap.currency !== null &&
    canUse(bootstrap, 'reservations') &&
    (principal.kind === 'guest' || canUse(bootstrap, 'accounts'))
  );
}
export async function requireFreshReservationConfiguration(
  context: TenantContext,
  client: CustomerTransport,
  bootstrap: Bootstrap,
  principal: Principal,
  zone: string,
  assertCurrent: () => void,
) {
  assertCurrent();
  if (!canStartReservation(context, bootstrap, principal) || zone !== bootstrap.timezone)
    throw new ApiFailure(409, 'refused');
  const fresh = await readBootstrap(client, context);
  assertCurrent();
  if (
    !canStartReservation(context, fresh, principal) ||
    fresh.timezone !== zone ||
    fresh.currency !== bootstrap.currency
  )
    throw new ApiFailure(404, 'refused');
}
