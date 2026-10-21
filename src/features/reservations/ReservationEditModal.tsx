import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReservationEditContext } from '../../api/reservationEditReads';
import type { CustomerReservationController } from '../../core/customerReservationController';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import ReservationDatePicker from './ReservationDatePicker';
import ReservationAttemptNotice from './ReservationAttemptNotice';
import { useReservation } from './ReservationProvider';
import { reservationToday } from './reservationCalendar';
import useReservationEditContext from './useReservationEditContext';
import useReservationEditForm from './useReservationEditForm';
import ReservationEditReview from './ReservationEditReview';
import ReservationEditFields from './ReservationEditFields';
import ReservationEditSitting from './ReservationEditSitting';
type Props = Readonly<{ reservationId: string; onBack: () => void; onClose: () => void }>;
export default function ReservationEditModal(props: Props) {
  const { t } = useTranslation();
  const source = useReservationEditContext(props.reservationId);
  if (source.data && source.controller)
    return (
      <Editor key={source.version} {...props} data={source.data} controller={source.controller} />
    );
  return (
    <BaseModal title={t('reservationEditTitle')} onClose={props.onClose}>
      <Feedback
        loading={source.loading}
        message={t(source.loading ? 'loading' : 'reservationEditUnavailable')}
        retry={source.refresh}
      />
      <Button label={t('back')} secondary onPress={props.onBack} />
      <Button label={t('close')} secondary onPress={props.onClose} />
    </BaseModal>
  );
}
function Editor({
  data,
  controller,
  onBack,
  onClose,
}: Props & Readonly<{ data: ReservationEditContext; controller: CustomerReservationController }>) {
  const { t } = useTranslation();
  const operations = useReservation();
  const form = useReservationEditForm(data, controller);
  const [choosing, setChoosing] = useState(false);
  const today = reservationToday(data.timeZone);
  if (choosing)
    return (
      <ReservationDatePicker
        day={form.date}
        minimum={today}
        onChoose={(day) => {
          setChoosing(false);
          form.setDate(day);
        }}
        onClose={() => setChoosing(false)}
      />
    );
  const review = form.review.review;
  const busy = form.busy;
  const disabled = busy || form.review.blocked;
  return (
    <BaseModal
      title={t(review ? 'reservationEditReview' : 'reservationEditTitle')}
      onClose={onClose}
    >
      {review ? (
        <ReservationEditReview form={form} onBack={onBack} />
      ) : (
        <>
          <ReservationAttemptNotice inlineConfirmation />
          {!operations?.value ? (
            <>
              <ReservationEditSitting
                form={form}
                data={data}
                disabled={disabled}
                today={today}
                onChooseDate={() => setChoosing(true)}
              />
              <ReservationEditFields form={form} disabled={disabled} />
              {form.review.failed || form.unsupportedSelection ? (
                <Feedback message={t('reservationEditUnavailable')} />
              ) : null}
              <Button
                label={t('reservationEditReview')}
                disabled={disabled || !form.canReview || form.date < today}
                busy={busy}
                onPress={() => void form.prepare()}
              />
            </>
          ) : null}
          <Button label={t('back')} secondary onPress={onBack} />
        </>
      )}
      <Button label={t('close')} secondary onPress={onClose} />
    </BaseModal>
  );
}
