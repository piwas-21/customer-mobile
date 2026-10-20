import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import ReservationAttemptActions from './ReservationAttemptActions';
import { useReservation } from './ReservationProvider';
export default function ReservationAttemptNotice() {
  const { t } = useTranslation();
  const operations = useReservation();
  const [confirm, setConfirm] = useState<{
    controller: NonNullable<typeof operations>['controller'];
    operationId: string;
    kind: 'retry' | 'cancel';
  }>();
  if (!operations?.controller) return null;
  const value = operations.value;
  const busy = operations.busy || operations.loading;
  const confirmation =
    confirm?.controller === operations.controller &&
    confirm.operationId === value?.operationId &&
    value.outcome === 'Pending'
      ? confirm
      : undefined;
  let message = 'reservationAttemptPending';
  if (value?.outcome === 'Applied') message = 'reservationAttemptReceived';
  else if (value?.outcome === 'Cancelled') message = 'reservationAttemptStopped';
  async function completeConfirmation() {
    if (!confirmation || !operations || busy) return;
    const captured = confirmation;
    setConfirm(undefined);
    try {
      if (captured.kind === 'retry') await operations.retryOriginal(captured.operationId);
      else await operations.cancelAttempt(captured.operationId);
    } catch {
      /* The shared pending view retains canonical recovery authority. */
    }
  }
  return (
    <>
      {operations.failed ? (
        <Feedback message={t('reservationRequestFailed')} retry={operations.refresh} />
      ) : null}
      {value ? (
        <>
          <Feedback message={t(message)} />
          <ReservationAttemptActions
            value={value}
            busy={busy}
            onCheck={() => void operations.check().catch(() => undefined)}
            onRetry={() =>
              setConfirm({
                controller: operations.controller,
                operationId: value.operationId,
                kind: 'retry',
              })
            }
            onStop={() =>
              setConfirm({
                controller: operations.controller,
                operationId: value.operationId,
                kind: 'cancel',
              })
            }
            onDone={() => void operations.acknowledge(value.operationId).catch(() => undefined)}
          />
        </>
      ) : null}
      {confirmation ? (
        <BaseModal
          title={t(
            confirmation.kind === 'retry' ? 'reservationRetryOriginal' : 'reservationStopAttempt',
          )}
          onClose={() => setConfirm(undefined)}
        >
          <Feedback
            message={t(
              confirmation.kind === 'retry'
                ? 'reservationRetryOriginalExplanation'
                : 'reservationStopAttemptExplanation',
            )}
          />
          <Button
            label={t(
              confirmation.kind === 'retry' ? 'reservationRetryOriginal' : 'reservationStopAttempt',
            )}
            busy={operations.busy}
            onPress={() => void completeConfirmation()}
          />
          <Button secondary label={t('back')} onPress={() => setConfirm(undefined)} />
        </BaseModal>
      ) : null}
    </>
  );
}
