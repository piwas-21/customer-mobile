import { useTranslation } from 'react-i18next';
import { readReservation } from '../../api/reservations';
import type { SessionController } from '../../core/sessionController';
import type { TenantContext } from '../../core/tenantContext';
import usePrivatePages from '../../core/usePrivatePages';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import ReservationSummary from './ReservationSummary';
import ReservationAttemptNotice from './ReservationAttemptNotice';
import useReservationCancellation from './useReservationCancellation';

type Props = Readonly<{
  context: TenantContext;
  controller: SessionController;
  userId: string;
  ownerVersion: string;
  reservationId: string;
  zone: string;
  onBack: () => void;
  onClose: () => void;
}>;
export default function ReservationDetailModal(props: Props) {
  const { t } = useTranslation();
  const result = usePrivatePages(
    props.context,
    props.userId,
    props.ownerVersion,
    'reservation-detail/' + props.reservationId,
    () => readReservation(props.controller, props.userId, props.reservationId),
    () => null,
  );
  const cancellation = useReservationCancellation(props.reservationId);
  const review = cancellation.review;
  return (
    <BaseModal
      title={t(review ? 'reservationCancelReview' : 'reservationDetails')}
      onClose={props.onClose}
    >
      {review ? (
        <>
          <ReservationSummary item={review.reservation} requests />
          <Feedback message={t('receiptTimeZone', { zone: review.timeZone })} />
          <Feedback message={t('reservationCancelExplanation')} />
          <Button
            label={t('reservationCancelConfirm')}
            destructive
            busy={cancellation.busy}
            onPress={() => void cancellation.confirm()}
          />
          <Button label={t('back')} secondary onPress={cancellation.dismiss} />
        </>
      ) : result.data ? (
        <>
          <ReservationSummary item={result.data} requests />
          <Feedback message={t('receiptTimeZone', { zone: props.zone })} />
        </>
      ) : (
        <Feedback
          loading={result.loading}
          message={t(result.loading ? 'loading' : 'reservationsUnavailable')}
        />
      )}
      {!review ? (
        <>
          <ReservationAttemptNotice inlineConfirmation />
          {cancellation.failed ? (
            <Feedback message={t('reservationCancellationUnavailable')} />
          ) : null}
          {cancellation.available &&
          result.data &&
          ['Pending', 'Confirmed'].includes(result.data.status) ? (
            <Button
              label={t('reservationCancelReview')}
              destructive
              disabled={cancellation.blocked}
              busy={cancellation.busy}
              onPress={() => void cancellation.prepare()}
            />
          ) : null}
          <Button
            label={t('refreshReservations')}
            disabled={result.loading}
            secondary
            onPress={result.refresh}
          />
          <Button label={t('backToReservations')} secondary onPress={props.onBack} />
        </>
      ) : null}
      <Button label={t('close')} secondary onPress={props.onClose} />
    </BaseModal>
  );
}
