import type { SessionRepository } from './sessionRepository';
import type { ReservationOperationRecord } from './reservationOperationRecord';
import { resolveReservationAttempt } from '../api/reservationCreate';
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

export async function dispatchReservationCreation(
  context: TenantContext,
  client: CustomerTransport,
  repository: SessionRepository,
  bootstrap: Bootstrap,
  record: ReservationOperationRecord,
  assertCurrent: () => void,
  locale: string,
) {
  if (record.cancellation || record.edit || record.cancellationRequested || record.resolution)
    throw new ApiFailure(409, 'refused');
  const draft = await repository.reservations.intent(context, record.principal, assertCurrent);
  if (!draft) throw new ApiFailure(409, 'refused');
  await requireFreshReservationConfiguration(
    context,
    client,
    bootstrap,
    record.principal,
    draft.timeZone,
    assertCurrent,
  );
  return resolveReservationAttempt(client, context, record, 'create', assertCurrent, locale, draft);
}
