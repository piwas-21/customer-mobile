export const reservationCreatePath = '/api/customer-mobile/reservations/create';
export const reservationCancellationPath = '/api/customer-mobile/reservations/cancellation';
export const reservationEditPath = '/api/customer-mobile/reservations/edit';
export function reservationOperationPath(cancellation: boolean, edit = false) {
  if (edit) return reservationEditPath;
  return cancellation ? reservationCancellationPath : reservationCreatePath;
}
export function isReservationRecoveryPath(path: string) {
  return [reservationCreatePath, reservationCancellationPath, reservationEditPath].some(
    (base) => path === base + '/recover' || path === base + '/cancel-attempt',
  );
}
