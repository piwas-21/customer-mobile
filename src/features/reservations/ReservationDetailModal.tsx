import { useTranslation } from 'react-i18next';
import { readReservation } from '../../api/reservations';
import type { SessionController } from '../../core/sessionController';
import type { TenantContext } from '../../core/tenantContext';
import usePrivatePages from '../../core/usePrivatePages';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import ReservationSummary from './ReservationSummary';

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
  return (
    <BaseModal title={t('reservationDetails')} onClose={props.onClose}>
      {result.data ? (
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
      <Button
        label={t('refreshReservations')}
        disabled={result.loading}
        secondary
        onPress={result.refresh}
      />
      <Button label={t('backToReservations')} secondary onPress={props.onBack} />
      <Button label={t('close')} secondary onPress={props.onClose} />
    </BaseModal>
  );
}
