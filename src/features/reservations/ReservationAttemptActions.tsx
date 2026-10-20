import { useTranslation } from 'react-i18next';
import type { ReservationAttemptView } from '../../core/reservationAttemptView';
import Button from '../../ui/Button';
type Props = Readonly<{
  value: ReservationAttemptView;
  busy: boolean;
  retryLabel?: string;
  stopLabel?: string;
  onCheck: () => void;
  onRetry: () => void;
  onStop: () => void;
  onDone: () => void;
}>;
export default function ReservationAttemptActions(props: Props) {
  const { t } = useTranslation();
  if (props.value.outcome !== 'Pending')
    return (
      <Button label={t('reservationRequestDone')} disabled={props.busy} onPress={props.onDone} />
    );
  return (
    <>
      <Button label={t('reservationCheckRequest')} disabled={props.busy} onPress={props.onCheck} />
      {props.value.canRetry ? (
        <Button
          secondary
          label={t(props.retryLabel ?? 'reservationRetryOriginal')}
          disabled={props.busy}
          onPress={props.onRetry}
        />
      ) : null}
      <Button
        secondary
        label={t(
          props.value.cancelling
            ? 'reservationFinishStopping'
            : (props.stopLabel ?? 'reservationStopAttempt'),
        )}
        disabled={props.busy}
        onPress={props.onStop}
      />
    </>
  );
}
