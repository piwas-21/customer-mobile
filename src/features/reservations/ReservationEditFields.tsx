import { useTranslation } from 'react-i18next';
import { reservationContactLimits } from '../../api/reservationCreateContract';
import { customerInputOptions } from '../../ui/customerInputOptions';
import Field from '../../ui/Field';
import Feedback from '../../ui/Feedback';
import type { ReservationEditForm } from './useReservationEditForm';

export default function ReservationEditFields({
  form,
  disabled,
}: Readonly<{ form: ReservationEditForm; disabled: boolean }>) {
  const { t } = useTranslation();
  return (
    <>
      {!form.fields ? (
        <Feedback
          loading={form.configured.isPending}
          message={t('reservationFieldsUnavailable')}
          retry={() => void form.configured.refetch()}
        />
      ) : (
        form.fields.map((field) => (
          <Field
            key={field.key}
            label={t('reservationField.' + field.key) + (field.required ? '' : t('optionalSuffix'))}
            value={form.draft[field.key]}
            onChangeText={(value) => form.change(field.key, value)}
            editable={!disabled}
            multiline={field.key === 'specialRequests'}
            maxLength={reservationContactLimits[field.key]}
            {...customerInputOptions(field.key)}
            {...(form.invalid.has(field.key) ? { error: t('reservationFieldInvalid') } : {})}
          />
        ))
      )}
    </>
  );
}
