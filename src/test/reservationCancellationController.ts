import { reservationControllerFixture } from './reservationController';
import { reservationCancellationPath } from '../core/reservationPaths';
export async function reservationCancellationControllerFixture() {
  const f = await reservationControllerFixture(true);
  f.ids
    .mockReset()
    .mockReturnValueOnce(f.prepared.sessionId)
    .mockReturnValueOnce(f.proof.operationId);
  const cancellation = {
    schemaVersion: 1 as const,
    proof: { ...f.proof, ownerProof: 'opaque_cancellation-proof' },
    reservation: {
      reservationId: f.applied.reservationId,
      reservationDate: '2030-05-17',
      startTime: '18:00:00',
      endTime: '20:00:00',
      numberOfGuests: 2,
      status: 'Confirmed',
      specialRequests: 'Private customer request',
    },
    timeZone: 'Europe/Zurich',
  };
  f.fetcher.mockImplementation((url) =>
    Promise.resolve(
      f.reply(
        new URL(url).pathname.endsWith('/bootstrap')
          ? f.bootstrap
          : new URL(url).pathname === reservationCancellationPath + '/prepare'
            ? cancellation
            : f.applied,
      ),
    ),
  );
  const install = () => {
    const { draft: _draft, ...scope } = f.prepared;
    return f.repository.reservations.installCancellation(
      f.context,
      {
        ...scope,
        principal: { kind: 'customer', id: f.principal.id },
        request: {
          schemaVersion: 1,
          operationId: cancellation.proof.operationId,
          tenantId: f.context.tenant.id,
          reservationId: cancellation.reservation.reservationId,
          timeZone: cancellation.timeZone,
        },
      },
      cancellation,
      f.guard,
    );
  };
  return { ...f, cancellation, install };
}
