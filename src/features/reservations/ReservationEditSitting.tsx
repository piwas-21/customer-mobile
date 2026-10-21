import { useTranslation } from 'react-i18next';
import type { ReservationEditContext } from '../../api/reservationEditReads';
import { reservationPartyBounds } from '../../api/reservationAvailability';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import QuantityStepper from '../../ui/QuantityStepper';
import { reservationDay, reservationHour } from './reservationPresentation';
import type { ReservationEditForm } from './useReservationEditForm';

type Props = Readonly<{
  form: ReservationEditForm;
  data: ReservationEditContext;
  disabled: boolean;
  today: string;
  onChooseDate: () => void;
}>;
export default function ReservationEditSitting({
  form,
  data,
  disabled,
  today,
  onChooseDate,
}: Props) {
  const { t, i18n } = useTranslation();
  const hour = (time: string) =>
    time === '1.00:00:00'
      ? t('reservationMidnight')
      : (reservationHour(time, i18n.language) ?? t('reservationTimeUnavailable'));
  const original = data.reservation;
  const canKeepOriginal =
    form.date === original.reservationDate && form.party === original.numberOfGuests;
  return (
    <>
      <Feedback message={t('receiptTimeZone', { zone: data.timeZone })} />
      <Button
        label={t('reservationDate', { date: reservationDay(form.date, i18n.language) })}
        secondary
        disabled={disabled}
        onPress={onChooseDate}
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
      {form.times.data?.slots.length === 0 ? <Feedback message={t('reservationNoTimes')} /> : null}
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
    </>
  );
}
