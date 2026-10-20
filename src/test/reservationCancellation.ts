import type { ReservationCancellationPreparation } from '../core/reservationCancellationPreparation';
import { reservationTransportFixture } from './reservationTransport';
import { reservationResultId } from './reservationCreate';
export async function reservationCancellationFixture() {
  const f = await reservationTransportFixture(true);
  const principal = { kind: 'customer' as const, id: f.principal.id };
  const prepared: ReservationCancellationPreparation = {
    environment: f.context.environment,
    tenantId: f.context.tenant.id,
    principal,
    sessionId: '9289328c-83c7-4e85-a723-92bbb2d4bf1d',
    request: {
      schemaVersion: 1,
      operationId: f.proof.operationId,
      tenantId: f.context.tenant.id,
      reservationId: reservationResultId,
      timeZone: 'Europe/Zurich',
    },
  };
  // Independent literal server fixture: customer snapshot and opaque purpose-specific proof.
  const cancellation = {
    schemaVersion: 1 as const,
    proof: { ...f.proof, ownerProof: 'opaque_cancellation-proof' },
    reservation: {
      reservationId: reservationResultId,
      reservationDate: '2030-05-17',
      startTime: '18:00:00',
      endTime: '20:00:00',
      numberOfGuests: 2,
      status: 'Confirmed',
      specialRequests: 'Private customer request',
    },
    timeZone: 'Europe/Zurich',
  };
  const install = () =>
    f.repository.reservations.installCancellation(f.context, prepared, cancellation, f.guard);
  return { ...f, principal, prepared, cancellation, install };
}
