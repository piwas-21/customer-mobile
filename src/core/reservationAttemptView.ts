import type { Bootstrap } from './capabilities';
import { canStartReservation } from './reservationCreationPolicy';
import type { ReservationOperationRecord } from './reservationOperationRecord';
import type { SessionRepository } from './sessionRepository';
import type { TenantContext } from './tenantContext';
export type ReservationAttemptView = Readonly<{
  operationId: string;
  cancellation?: true;
  retryBlocked?: true;
  outcome: 'Pending' | 'Applied' | 'Cancelled';
  reservationId: string | null;
  cancelling: boolean;
  canRetry: boolean;
}>;
// Views expose no session, provider proof, payload fingerprint or private contact input.
export async function reservationAttemptView(
  context: TenantContext,
  repository: SessionRepository,
  record: ReservationOperationRecord,
  assertCurrent: () => void,
  bootstrap: Bootstrap,
): Promise<ReservationAttemptView> {
  const draft =
    record.resolution || record.cancellationRequested
      ? null
      : await repository.reservations.intent(context, record.principal, assertCurrent);
  assertCurrent();
  let outcome: ReservationAttemptView['outcome'] = 'Pending';
  if (record.resolution?.outcome === 'Applied') outcome = 'Applied';
  else if (record.resolution?.outcome === 'Cancelled') outcome = 'Cancelled';
  return {
    operationId: record.proof.operationId,
    ...(record.cancellation ? { cancellation: true as const } : {}),
    ...(record.cancellation?.retryBlocked ? { retryBlocked: true as const } : {}),
    outcome,
    reservationId: record.resolution?.reservationId ?? null,
    cancelling: record.cancellationRequested,
    canRetry:
      !record.resolution &&
      !record.cancellationRequested &&
      !record.cancellation?.retryBlocked &&
      (record.cancellation !== undefined || draft !== null) &&
      canStartReservation(context, bootstrap, record.principal),
  };
}
