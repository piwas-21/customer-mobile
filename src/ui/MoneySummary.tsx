import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { spacing, typography, useTheme } from './theme';
type Money = Readonly<{
  subTotal: number;
  deliveryFee: number;
  discount: number;
  customerDiscount: number;
  total: number;
  tax?: number;
  pointsDiscount?: number;
  tip?: number;
}>;
export default function MoneySummary({
  value,
  price,
}: Readonly<{ value: Money; price: (amount: number) => string }>) {
  const { t } = useTranslation();
  const theme = useTheme();
  const rows = [
    { key: 'subtotal', amount: value.subTotal },
    { key: 'tax', amount: value.tax ?? 0 },
    { key: 'deliveryFee', amount: value.deliveryFee },
    { key: 'discount', amount: value.discount + value.customerDiscount },
    { key: 'pointsCredit', amount: value.pointsDiscount ?? 0 },
    { key: 'tip', amount: value.tip ?? 0 },
  ].filter((row) => row.key === 'subtotal' || row.amount > 0);
  return (
    <View style={styles.summary}>
      {rows.map((row) => (
        <Text key={row.key} style={[styles.body, { color: theme.text }]}>
          {t(row.key)}: {price(row.amount)}
        </Text>
      ))}
      <Text style={[styles.total, { color: theme.text }]}>
        {t('total')}: {price(value.total)}
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  summary: { gap: spacing.md },
  body: { fontSize: typography.body },
  total: { fontSize: typography.heading, fontWeight: '700' },
});
