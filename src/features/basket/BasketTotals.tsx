import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { CustomerBasket } from '../../api/basketResponse';
import { spacing, typography, useTheme } from '../../ui/theme';
export default function Totals({
  value,
  price,
}: Readonly<{ value: CustomerBasket; price: (amount: number) => string }>) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={styles.totals}>
      <Text style={[styles.hint, { color: theme.secondary }]}>{t('serverPricedBasket')}</Text>
      <Text style={[styles.body, { color: theme.text }]}>
        {t('subtotal')}: {price(value.subTotal)}
      </Text>
      {value.deliveryFee > 0 ? (
        <Text style={[styles.body, { color: theme.text }]}>
          {t('deliveryFee')}: {price(value.deliveryFee)}
        </Text>
      ) : null}
      {value.discount + value.customerDiscount > 0 ? (
        <Text style={[styles.body, { color: theme.text }]}>
          {t('discount')}: {price(value.discount + value.customerDiscount)}
        </Text>
      ) : null}
      <Text style={[styles.total, { color: theme.text }]}>
        {t('total')}: {price(value.total)}
      </Text>
      <Text style={[styles.body, { color: theme.secondary }]}>{t('checkoutPreparing')}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  body: { fontSize: typography.body },
  hint: { fontSize: typography.small },
  totals: { gap: spacing.md, paddingVertical: spacing.lg },
  total: { fontSize: typography.heading, fontWeight: '700' },
});
