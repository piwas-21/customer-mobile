import { useTranslation } from 'react-i18next';
import type { ReservationEditForm } from './useReservationEditForm';
import Feedback from '../../ui/Feedback';
import Button from '../../ui/Button';
import ReservationSummary from './ReservationSummary';

export default function ReservationEditReview({
  form,
  onBack,
}: Readonly<{ form: ReservationEditForm; onBack: () => void }>) {
  const { t } = useTranslation();
  const review = form.review.review;
  if (!review) return null;
  const busy = form.busy;
  return (
    <>
      <Feedback message={t('reservationEditOriginal')} />
      <ReservationSummary item={review.original} requests />
      <Feedback message={t('reservationEditProposed')} />
      <ReservationSummary item={review.proposed} requests />
      {form.fields?.map((field) => (
        <Feedback
          key={field.key}
          message={
            t('reservationField.' + field.key) +
            ': ' +
            (form.input?.[field.key] ?? t('reservationNoContactValue'))
          }
        />
      ))}
      <Feedback message={t('reservationEditApproval')} />
      <Feedback message={t('receiptTimeZone', { zone: review.timeZone })} />
      <Button
        label={t('reservationEditConfirm')}
        busy={busy}
        onPress={() => {
          void form.review.confirm();
          onBack();
        }}
      />
      <Button label={t('back')} secondary onPress={form.review.dismiss} />
    </>
  );
}
