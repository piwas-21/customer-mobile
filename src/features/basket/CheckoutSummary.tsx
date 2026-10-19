import { Pressable, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type useCheckoutFlow from './useCheckoutFlow';
import MoneySummary from '../../ui/MoneySummary';
import Feedback from '../../ui/Feedback';
import Button from '../../ui/Button';
import { spacing, typography, useTheme } from '../../ui/theme';
export default function CheckoutSummary({
  flow,
}: Readonly<{ flow: ReturnType<typeof useCheckoutFlow> }>) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const review = flow.review;
  const quote = review.quote;
  if (flow.busy) return <Feedback loading message={t('placingOrder')} />;
  if (review.changed) return <Feedback message={t('checkoutReviewChanged')} />;
  if (review.busy) return <Feedback loading message={t('loading')} />;
  if (!quote) return <Feedback message={t('checkoutQuoteUnavailable')} />;
  return (
    <>
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
        <Pressable
          key={method}
          accessibilityRole="radio"
          accessibilityLabel={t(`checkoutPayment${method}`)}
          accessibilityState={{ checked: flow.method === method }}
          onPress={() => flow.chooseMethod(method)}
          style={[
            styles.method,
            {
              borderColor: flow.method === method ? theme.accent : theme.border,
              backgroundColor: theme.surface,
            },
          ]}
        >
          <Text
            style={[styles.body, { color: theme.text }]}
          >{`${flow.method === method ? '● ' : '○ '}${t(`checkoutPayment${method}`)}`}</Text>
        </Pressable>
      ))}
      <Text style={[styles.body, { color: theme.secondary }]}>{t('checkoutPaymentHint')}</Text>
      <Button label={t('placeOrder')} onPress={() => void flow.place()} disabled={!flow.canPlace} />
      {!flow.canPlace ? <Feedback message={t('checkoutRequirementsChanged')} /> : null}
    </>
  );
}
const styles = StyleSheet.create({
  body: { fontSize: typography.body },
  method: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
    justifyContent: 'center',
  },
});
