import { reservationContactLimits } from '../../api/reservationCreateContract';
import { customerInputOptions } from '../../ui/customerInputOptions';
import { useTranslation } from 'react-i18next';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import Field from '../../ui/Field';
import useReservationForm, { type ReservationSelection } from './useReservationForm';
import { reservationDay, reservationHour } from './reservationPresentation';
export default function ReservationCreateModal({
  selection,
  onClose,
}: Readonly<{ selection: ReservationSelection; onClose: () => void }>) {
  const { t, i18n } = useTranslation();
  const form = useReservationForm(selection);
  const fields = form.fields.fields;
  return (
    <BaseModal title={t('reservationRequestTitle')} onClose={onClose}>
      <Feedback
        message={t('reservationRequestReview', {
          date: reservationDay(selection.date, i18n.language),
          time: reservationHour(selection.startTime, i18n.language),
          count: selection.numberOfGuests,
        })}
      />
      <Feedback message={t('receiptTimeZone', { zone: selection.timeZone })} />
      <Feedback message={t('reservationAvailabilityAdvisory')} />
      {!fields ? (
        <Feedback
          loading={form.fields.isPending}
          message={t('reservationFieldsUnavailable')}
          retry={() => void form.fields.refetch()}
        />
      ) : (
        fields.map((field, index) => (
          <Field
            key={field.key}
            label={t('reservationField.' + field.key) + (field.required ? '' : t('optionalSuffix'))}
            value={form.draft[field.key]}
            onChangeText={(value) => form.change(field.key, value)}
            editable={!form.busy}
            autoFocus={index === 0}
            multiline={field.key === 'specialRequests'}
            maxLength={reservationContactLimits[field.key]}
            {...customerInputOptions(field.key)}
            {...(form.invalid.has(field.key) ? { error: t('reservationFieldInvalid') } : {})}
          />
        ))
      )}
      {form.failed ? <Feedback message={t('reservationRequestFailed')} /> : null}
      <Button
        label={t('reservationSendRequest')}
        busy={form.busy}
        disabled={!fields || form.busy}
        onPress={() => void form.submit()}
      />
      <Button label={t('close')} secondary onPress={onClose} />
    </BaseModal>
  );
}
