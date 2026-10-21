import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReservationEditContext } from '../../api/reservationEditReads';
import { reservationPartyBounds } from '../../api/reservationAvailability';
import type { CustomerReservationController } from '../../core/customerReservationController';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import QuantityStepper from '../../ui/QuantityStepper';
import ReservationDatePicker from './ReservationDatePicker';
import ReservationAttemptNotice from './ReservationAttemptNotice';
import { useReservation } from './ReservationProvider';
import { reservationDay, reservationHour } from './reservationPresentation';
import { reservationToday } from './reservationCalendar';
import useReservationEditContext from './useReservationEditContext';
import useReservationEditForm from './useReservationEditForm';
import ReservationEditReview from './ReservationEditReview';
import ReservationEditFields from './ReservationEditFields';
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
  const { t, i18n } = useTranslation();
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
  const hour = (time: string) =>
    time === '1.00:00:00'
      ? t('reservationMidnight')
      : (reservationHour(time, i18n.language) ?? t('reservationTimeUnavailable'));
  const original = data.reservation;
  const canKeepOriginal =
    form.date === original.reservationDate && form.party === original.numberOfGuests;
  return (
    <BaseModal
      title={t(review ? 'reservationEditReview' : 'reservationEditTitle')}
      onClose={onClose}
    >
      {review ? (
        <>
          <ReservationEditReview form={form} onBack={onBack} />
        </>
      ) : (
        <>
          <ReservationAttemptNotice inlineConfirmation />
          {!operations?.value ? (
            <>
              <Feedback message={t('receiptTimeZone', { zone: data.timeZone })} />
              <Button
                label={t('reservationDate', { date: reservationDay(form.date, i18n.language) })}
                secondary
                disabled={disabled}
                onPress={() => setChoosing(true)}
              />
              <QuantityStepper
                label={t('reservationPartySize')}
                value={form.party}
                minimum={reservationPartyBounds.minimum}
                maximum={reservationPartyBounds.maximum}
                onChange={(value) => {
                  if (!disabled) form.setParty(value);
                }}
              />
              {canKeepOriginal ? (
                <Button
                  secondary
                  label={t('reservationKeepCurrentTime', {
                    start: hour(original.startTime),
                    end: hour(original.endTime),
                  })}
                  disabled={disabled}
                  onPress={() => form.choose(original.startTime, original.endTime)}
                />
              ) : null}
              <Button
                label={t('reservationCheckTimes')}
                disabled={disabled || form.date < today}
                onPress={form.checkTimes}
              />
              {form.times.failed ? <Feedback message={t('reservationTimesFailed')} /> : null}
              {form.times.data?.slots.map((slot) => (
                <Button
                  key={slot.startTime + slot.endTime}
                  secondary
                  label={t('reservationChooseSlot', {
                    start: hour(slot.startTime),
                    end: hour(slot.endTime),
                  })}
                  disabled={disabled}
                  onPress={() => form.choose(slot.startTime, slot.endTime)}
                />
              ))}
              {form.times.data?.slots.length === 0 ? (
                <Feedback message={t('reservationNoTimes')} />
              ) : null}
              {form.selection ? (
                <Feedback
                  message={t('reservationChosenTime', {
                    start: hour(form.selection.startTime),
                    end: hour(form.selection.endTime),
                  })}
                />
              ) : (
                <Feedback message={t('reservationChooseTimeInputs')} />
              )}
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
