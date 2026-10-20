import { reservationControllerFixture } from './reservationController';
import { reservationEditPath } from '../core/reservationPaths';
import type { ReservationEditPreparation } from '../core/reservationEditPreparation';
export async function reservationEditControllerFixture() {
  const f = await reservationControllerFixture(true);
  f.ids
    .mockReset()
    .mockReturnValueOnce(f.prepared.sessionId)
    .mockReturnValueOnce(f.proof.operationId);
  const input = { ...f.input, reservationId: f.applied.reservationId };
  const prepared: ReservationEditPreparation = {
    ...f.prepared,
    principal: { kind: 'customer', id: f.principal.id },
    draft: { ...f.prepared.draft, reservationId: f.applied.reservationId },
  };
  const edit = {
    schemaVersion: 1 as const,
    proof: { ...f.proof, ownerProof: 'protected_native_edit_proof' },
    original: {
      reservationId: f.applied.reservationId,
      reservationDate: '2030-05-17',
      startTime: '16:00:00',
      endTime: '18:00:00',
      numberOfGuests: 6,
      status: 'Confirmed',
      specialRequests: 'Previous request',
    },
    proposed: {
      reservationId: f.applied.reservationId,
      reservationDate: '2030-05-17',
      startTime: '18:00:00',
      endTime: '20:00:00',
      numberOfGuests: 6,
      status: 'Pending',
      specialRequests: 'Customer request',
    },
    timeZone: 'Europe/Zurich',
  };
  f.fetcher.mockImplementation((url) =>
    Promise.resolve(
      f.reply(
        new URL(url).pathname.endsWith('/bootstrap')
          ? f.bootstrap
          : new URL(url).pathname === reservationEditPath + '/prepare'
            ? edit
            : f.applied,
      ),
    ),
  );
  const install = () => f.repository.reservations.installEdit(f.context, prepared, edit, f.guard);
  return { ...f, input, prepared, edit, install };
}
