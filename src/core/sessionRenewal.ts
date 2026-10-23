import { refreshPrivateTableSession } from '../api/privateTableRenewal';
import { refreshTableRoundSession } from '../api/tableRounds';
import type { CustomerRecoveryAuthority } from './customerRecoveryReads';
import { refreshSession, refreshReservationSession } from '../api/auth';
import type { CustomerSession } from './credentials';
import type { SessionRepository } from './sessionRepository';
import type { TenantContext } from './tenantContext';
import { ApiFailure, type CustomerTransport } from './transport';
export async function renewStoredSession(
  context: TenantContext,
  client: CustomerTransport,
  repository: SessionRepository,
  captured: CustomerSession,
  isCurrent: () => boolean,
  rejected: () => Promise<void>,
  authority?: CustomerRecoveryAuthority,
): Promise<CustomerSession> {
  const guard = () => {
    if (!isCurrent()) throw new ApiFailure(401, 'refused');
    authority?.assertCurrent?.();
  };
  guard();
  let next: CustomerSession;
  try {
    if (authority?.tablePlan)
      next = await refreshPrivateTableSession(client, context, captured, guard, {
        kind: 'plan',
        record: authority.tablePlan,
      });
    else if (authority?.tableContribution)
      next = await refreshPrivateTableSession(client, context, captured, guard, {
        kind: 'contribution',
        record: authority.tableContribution,
      });
    else if (authority?.tableRound)
      next = await refreshTableRoundSession(client, context, captured, guard, authority.tableRound);
    else if (authority?.reservation)
      next = await refreshReservationSession(
        client,
        context,
        captured,
        guard,
        authority.reservation,
      );
    else
      next = await refreshSession(
        client,
        context,
        captured,
        guard,
        authority?.proof,
        authority?.paymentOrderId,
        authority?.cancellation,
      );
  } catch (error) {
    guard();
    if (error instanceof ApiFailure && error.status === 401 && error.reason === 'http')
      await rejected();
    throw error;
  }
  guard();
  await repository.activate(context, next, () => {
    guard();
    return true;
  });
  guard();
  return next;
}
