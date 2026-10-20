import type { ReservationAttemptView } from '../../core/reservationAttemptView';
const creationMessages = {
  Pending: 'reservationAttemptPending',
  Applied: 'reservationAttemptReceived',
  Cancelled: 'reservationAttemptStopped',
};
const cancellationMessages = {
  Pending: 'reservationCancellationPending',
  Applied: 'reservationCancellationApplied',
  Cancelled: 'reservationCancellationStopped',
};
const editMessages = {
  Pending: 'reservationEditPending',
  Applied: 'reservationEditApplied',
  Cancelled: 'reservationEditStopped',
};
export function reservationAttemptCopy(value: ReservationAttemptView | null | undefined) {
  let messages = creationMessages;
  let stopLabel = 'reservationStopAttempt';
  let stopExplanation = 'reservationStopAttemptExplanation';
  if (value?.edit) {
    messages = editMessages;
    stopLabel = 'reservationEditStop';
    stopExplanation = 'reservationEditStopExplanation';
  } else if (value?.cancellation) {
    messages = cancellationMessages;
    stopLabel = 'reservationCancellationStop';
    stopExplanation = 'reservationCancellationStopExplanation';
  }
  let message = messages[value?.outcome ?? 'Pending'];
  if (value?.outcome === 'Pending' && value.retryBlocked)
    message = value.edit ? 'reservationEditChanged' : 'reservationCancellationChanged';
  return {
    message,
    retryLabel: 'reservationRetryOriginal',
    stopLabel,
    retryExplanation: 'reservationRetryOriginalExplanation',
    stopExplanation,
  };
}
