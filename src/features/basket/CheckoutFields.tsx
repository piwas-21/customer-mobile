import { checkoutInputLimits } from '../../api/checkoutIntent';
import { Text, StyleSheet, type TextInputProps } from 'react-native';
import { useTranslation } from 'react-i18next';
import type useCheckoutFlow from './useCheckoutFlow';
import type { CheckoutDraft } from '../../domain/checkoutDraft';
import Field from '../../ui/Field';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { typography, useTheme } from '../../ui/theme';
type Flow = ReturnType<typeof useCheckoutFlow>;
function inputOptions(key: keyof CheckoutDraft): TextInputProps {
  if (key === 'email')
    return {
      keyboardType: 'email-address',
      autoComplete: 'email',
      textContentType: 'emailAddress',
      autoCapitalize: 'none',
    };
  if (key === 'phone')
    return { keyboardType: 'phone-pad', autoComplete: 'tel', textContentType: 'telephoneNumber' };
  if (key === 'postalCode') return { autoComplete: 'postal-code', textContentType: 'postalCode' };
  if (key === 'street')
    return { autoComplete: 'street-address', textContentType: 'fullStreetAddress' };
  if (key === 'name')
    return { autoComplete: 'name', textContentType: 'name', autoCapitalize: 'words' };
  return {};
}
export default function CheckoutFields({
  flow,
  currency,
}: Readonly<{ flow: Flow; currency?: string | undefined }>) {
  const { t } = useTranslation();
  const theme = useTheme();
  const fields = flow.fields.fields;
  if (!fields)
    return (
      <Feedback
        loading={flow.fields.isPending}
        message={t('checkoutFieldsUnavailable')}
        retry={() => void flow.fields.refetch()}
      />
    );
  return (
    <>
      <Text style={[styles.hint, { color: theme.secondary }]}>{t('checkoutContactHint')}</Text>
      {[...fields.contact, ...fields.address].map((field) => (
        <Field
          key={field.key}
          label={t('checkoutField.' + field.key) + (field.required ? '' : t('optionalSuffix'))}
          value={flow.draft[field.key]}
          onChangeText={(value) => flow.change(field.key, value)}
          maxLength={checkoutInputLimits[field.key]}
          autoFocus={field.key === 'name'}
          editable={!flow.busy}
          multiline={field.key === 'street' || field.key === 'additionalInfo'}
          {...inputOptions(field.key)}
          {...(flow.invalid(field.key) ? { error: t('checkoutFieldInvalid') } : {})}
        />
      ))}
      <Field
        label={currency ? t('checkoutTipCurrency', { currency }) : t('checkoutTip')}
        maxLength={checkoutInputLimits.tip}
        value={flow.draft.tip}
        keyboardType="decimal-pad"
        editable={!flow.busy}
        onChangeText={(value) => flow.change('tip', value)}
        {...(flow.invalid('tip') ? { error: t('checkoutTipInvalid') } : {})}
      />
      <Button label={t('reviewOrder')} onPress={() => void flow.showReview()} busy={flow.busy} />
    </>
  );
}
const styles = StyleSheet.create({ hint: { fontSize: typography.body } });
