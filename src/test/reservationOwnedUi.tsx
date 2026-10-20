import { randomUUID } from 'expo-crypto';
import { reservationUiFixture } from './reservationUi';
import ReservationDetailModal from '../features/reservations/ReservationDetailModal';
export async function ownedReservationUiFixture() {
  const f = await reservationUiFixture(true);
  jest
    .mocked(randomUUID)
    .mockReset()
    .mockReturnValueOnce(f.prepared.sessionId)
    .mockReturnValueOnce(f.proof.operationId);
  const close = jest.fn();
  const back = jest.fn();
  const view = (id = f.applied.reservationId) => (
    <ReservationDetailModal
      context={f.context}
      controller={f.sessions}
      userId={f.principal.id}
      ownerVersion={f.sessions.ownerVersion}
      reservationId={id}
      zone={f.bootstrap.data!.timezone}
      onBack={back}
      onClose={close}
    />
  );
  return { ...f, close, back, view };
}
