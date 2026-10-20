import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Feedback from '../../ui/Feedback';
import Button from '../../ui/Button';
import { usePayment } from './PaymentProvider';
export default function PaymentNotice() {
  const payment = usePayment();
  const { t } = useTranslation();
  if (!payment.value && !payment.failed) return null;
  return (
    <View>
      {payment.value ? <Feedback message={t(`hostedPayment.${payment.value.state}`)} /> : null}
      {payment.failed ? <Feedback message={t('hostedPayment.unavailable')} /> : null}
      {payment.value?.canOpen ? (
        <Button label={t('hostedPayment.open')} busy={payment.busy} onPress={payment.open} />
      ) : null}
      <Button
        secondary
        label={t('hostedPayment.check')}
        disabled={payment.busy || payment.loading}
        onPress={payment.refresh}
      />
    </View>
  );
}
