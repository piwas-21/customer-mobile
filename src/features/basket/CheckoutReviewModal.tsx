import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import MoneySummary from '../../ui/MoneySummary';
import { spacing, typography, useTheme } from '../../ui/theme';
import type useCheckoutReview from './useCheckoutReview';
export default function CheckoutReviewModal({
  review,
}: Readonly<{ review: ReturnType<typeof useCheckoutReview> }>) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const quote = review.quote;
  return (
    <BaseModal title={t('checkoutReview')} onClose={review.close}>
      <ReviewFeedback review={review} />
      {quote ? (
        <View style={styles.content}>
          <Text style={[styles.body, { color: theme.secondary }]}>
            {t(quote.priceChanged ? 'checkoutPriceChanged' : 'serverPricedBasket')}
          </Text>
          <MoneySummary
            value={quote.money}
            price={(amount) =>
              new Intl.NumberFormat(i18n.language, {
                style: 'currency',
                currency: quote.currency,
              }).format(amount)
            }
          />
          <Text accessibilityRole="header" style={[styles.body, { color: theme.text }]}>
            {t('availablePaymentMethods')}
          </Text>
          {quote.availablePaymentMethods.map((method) => (
            <Text key={method} style={[styles.body, { color: theme.text }]}>
              {t(`checkoutPayment${method}`)}
            </Text>
          ))}
          <Text style={[styles.body, { color: theme.secondary }]}>{t('checkoutReviewOnly')}</Text>
        </View>
      ) : null}
      <Button label={t('close')} onPress={review.close} secondary />
    </BaseModal>
  );
}
function ReviewFeedback({ review }: Readonly<{ review: ReturnType<typeof useCheckoutReview> }>) {
  const { t } = useTranslation();
  if (review.changed) return <Feedback message={t('checkoutReviewChanged')} />;
  if (review.busy) return <Feedback loading message={t('loading')} />;
  if (review.failed)
    return <Feedback message={t('checkoutQuoteUnavailable')} retry={() => void review.show()} />;
  return null;
}
const styles = StyleSheet.create({
  content: { gap: spacing.md },
  body: { fontSize: typography.body },
});
