import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import ReservationAttemptActions from './ReservationAttemptActions';
import { reservationAttemptCopy } from './reservationAttemptCopy';
import { useReservation } from './ReservationProvider';
export default function ReservationAttemptNotice({
  inlineConfirmation = false,
}: Readonly<{ inlineConfirmation?: boolean }>) {
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
  const copy = reservationAttemptCopy(value);
  const actionLabel = confirmation?.kind === 'retry' ? copy.retryLabel : copy.stopLabel;
  const explanation = confirmation?.kind === 'retry' ? copy.retryExplanation : copy.stopExplanation;
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
  const confirmationContent = confirmation ? (
    <>
      <Feedback message={t(explanation)} />
      <Button
        label={t(actionLabel)}
        busy={operations.busy}
        onPress={() => void completeConfirmation()}
      />
      <Button secondary label={t('back')} onPress={() => setConfirm(undefined)} />
    </>
  ) : null;
  let confirmationView = confirmationContent;
  if (confirmation && !inlineConfirmation) {
    confirmationView = (
      <BaseModal title={t(actionLabel)} onClose={() => setConfirm(undefined)}>
        {confirmationContent}
      </BaseModal>
    );
  }
  return (
    <>
      {operations.failed ? (
        <Feedback message={t('reservationRequestFailed')} retry={operations.refresh} />
      ) : null}
      {value ? (
        <>
          <Feedback message={t(copy.message)} />
          <ReservationAttemptActions
            value={value}
            busy={busy}
            retryLabel={copy.retryLabel}
            stopLabel={copy.stopLabel}
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
      {confirmationView}
    </>
  );
}
