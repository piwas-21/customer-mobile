import { ownedReservationUiFixture } from './reservationOwnedUi';
import { reservationCancellationPath } from '../core/reservationPaths';
export async function reservationCancellationUiFixture() {
  const f = await ownedReservationUiFixture();
  const item = {
    reservationId: f.applied.reservationId,
    reservationDate: '2030-05-17',
    startTime: '18:00:00',
    endTime: '20:00:00',
    numberOfGuests: 2,
    status: 'Pending',
    specialRequests: 'Original request',
  };
  const prepared = {
    schemaVersion: 1,
    proof: { ...f.proof, ownerProof: 'opaque_cancel-proof' },
    reservation: {
      ...item,
      numberOfGuests: 4,
      status: 'Confirmed',
      specialRequests: 'Current reviewed request',
    },
    timeZone: 'Europe/Zurich',
  };
  f.fetcher.mockImplementation((url) =>
    Promise.resolve(
      f.reply(
        new URL(url).pathname.endsWith('/bootstrap')
          ? f.bootstrap.data
          : new URL(url).pathname === reservationCancellationPath + '/prepare'
            ? prepared
            : new URL(url).pathname.startsWith(reservationCancellationPath)
              ? f.applied
              : item,
      ),
    ),
  );
  return { ...f, item, prepared };
}
