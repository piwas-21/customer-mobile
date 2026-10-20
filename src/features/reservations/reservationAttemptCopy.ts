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
export function reservationAttemptCopy(value: ReservationAttemptView | null | undefined) {
  const cancellation = Boolean(value?.cancellation);
  const messages = cancellation ? cancellationMessages : creationMessages;
  let message = messages[value?.outcome ?? 'Pending'];
  if (value?.outcome === 'Pending' && value.retryBlocked)
    message = 'reservationCancellationChanged';
  return {
    message,
    retryLabel: cancellation ? 'reservationCancellationRetry' : 'reservationRetryOriginal',
    stopLabel: cancellation ? 'reservationCancellationStop' : 'reservationStopAttempt',
    retryExplanation: cancellation
      ? 'reservationCancellationRetryExplanation'
      : 'reservationRetryOriginalExplanation',
    stopExplanation: cancellation
      ? 'reservationCancellationStopExplanation'
      : 'reservationStopAttemptExplanation',
  };
}
