export const reservationCreatePath = '/api/customer-mobile/reservations/create';
export const reservationCancellationPath = '/api/customer-mobile/reservations/cancellation';
export const reservationOperationPath = (cancellation: boolean) =>
  cancellation ? reservationCancellationPath : reservationCreatePath;
export function isReservationRecoveryPath(path: string) {
  return [reservationCreatePath, reservationCancellationPath].some(
    (base) => path === base + '/recover' || path === base + '/cancel-attempt',
  );
}
