import type { CustomerReservationController } from '../../core/customerReservationController';
import type { ReservationState } from './ReservationProvider';
import useReservationReview from './useReservationReview';
const actions = {
  prepare: (controller: CustomerReservationController, id: string, locale: string) =>
    controller.prepareCancellation(id, locale),
  dismiss: (controller: CustomerReservationController, id: string) =>
    controller.dismissCancellation(id),
  confirm: (operations: ReservationState, id: string) => operations.confirmCancellation(id),
};
export default function useReservationCancellation(reservationId: string) {
  return useReservationReview(reservationId, actions);
}
