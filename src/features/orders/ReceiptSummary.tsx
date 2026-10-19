import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { OrderReceipt } from '../../api/orderReceipt';
import MoneySummary from '../../ui/MoneySummary';
import StatusBadge from '../../ui/StatusBadge';
import { spacing, typography, useTheme } from '../../ui/theme';
import { orderStatusKey, receiptFormatters } from './orderPresentation';
export default function ReceiptSummary({ value }: Readonly<{ value: OrderReceipt }>) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const format = receiptFormatters(value, i18n.language);
  const rows = [
    ['receiptCredit', value.billingCreditAmount],
    ['receiptCharges', value.billChargeAmount],
    ['receiptPayable', value.payableTotal],
    ['receiptPaid', value.totalPaid],
    ['receiptRemaining', value.remainingAmount],
  ] as const;
  return (
    <View style={styles.content}>
      <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>
        {t('orderReceipt', { number: value.orderNumber })}
      </Text>
      <Text style={[styles.body, { color: theme.secondary }]}>
        {t('receiptDate', { date: format.date(value.orderDate) })}
      </Text>
      <Text style={[styles.body, { color: theme.text }]}>{t('receiptFulfillment')}</Text>
      <StatusBadge label={t(orderStatusKey(value.status, false))} />
      <Text style={[styles.body, { color: theme.text }]}>{t('receiptPaymentLabel')}</Text>
      <StatusBadge
        label={t(orderStatusKey(value.paymentStatus, true))}
        tone={value.paymentStatus === 'Completed' ? 'positive' : 'neutral'}
      />
      {value.expectedReadyAt ? (
        <Text style={[styles.body, { color: theme.text }]}>
          {t('receiptReady', { date: format.date(value.expectedReadyAt) })}
        </Text>
      ) : null}
      {value.estimatedDeliveryTime ? (
        <Text style={[styles.body, { color: theme.text }]}>
          {t('receiptDelivery', { date: format.date(value.estimatedDeliveryTime) })}
        </Text>
      ) : null}
      <Text style={[styles.body, { color: theme.secondary }]}>
        {t('receiptTimeZone', { zone: value.businessTimeZoneId })}
      </Text>
      <MoneySummary value={value.money} price={format.price} />
      {rows.map(([key, amount]) => (
        <Text key={key} style={[styles.body, { color: theme.text }]}>
          {t(key)}: {format.price(amount)}
        </Text>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  content: { gap: spacing.md },
  heading: { fontSize: typography.heading, fontWeight: '700' },
  body: { fontSize: typography.body },
});
