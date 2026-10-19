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
  const money = quote?.money;
  const rows = money
    ? [
        { label: t('subtotal'), amount: money.subTotal },
        ...(money.tax ? [{ label: t('tax'), amount: money.tax }] : []),
        ...(money.deliveryFee ? [{ label: t('deliveryFee'), amount: money.deliveryFee }] : []),
        ...(money.discount + money.customerDiscount
          ? [{ label: t('discount'), amount: money.discount + money.customerDiscount }]
          : []),
        ...(money.pointsDiscount
          ? [{ label: t('pointsCredit'), amount: money.pointsDiscount }]
          : []),
        ...(money.tip ? [{ label: t('tip'), amount: money.tip }] : []),
      ]
    : [];
  return (
    <BaseModal title={t('checkoutReview')} onClose={review.close}>
      {review.changed ? (
        <Feedback message={t('checkoutReviewChanged')} />
      ) : review.busy || review.failed ? (
        <Feedback
          loading={review.busy}
          message={t(review.busy ? 'loading' : 'checkoutQuoteUnavailable')}
          retry={review.failed ? () => void review.show() : undefined}
        />
      ) : null}
      {quote && money ? (
        <View style={styles.content}>
          <Text style={[styles.body, { color: theme.secondary }]}>
            {t(quote.priceChanged ? 'checkoutPriceChanged' : 'serverPricedBasket')}
          </Text>
          <MoneySummary
            rows={rows}
            total={money.total}
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
const styles = StyleSheet.create({
  content: { gap: spacing.md },
  body: { fontSize: typography.body },
});
