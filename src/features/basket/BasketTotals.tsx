import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { CustomerBasket } from '../../api/basketResponse';
import MoneySummary from '../../ui/MoneySummary';
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
      <MoneySummary
        rows={[
          { label: t('subtotal'), amount: value.subTotal },
          ...(value.deliveryFee > 0
            ? [{ label: t('deliveryFee'), amount: value.deliveryFee }]
            : []),
          ...(value.discount + value.customerDiscount > 0
            ? [{ label: t('discount'), amount: value.discount + value.customerDiscount }]
            : []),
        ]}
        total={value.total}
        price={price}
      />
      <Text style={[styles.body, { color: theme.secondary }]}>{t('checkoutPreparing')}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  body: { fontSize: typography.body },
  hint: { fontSize: typography.small },
  totals: { gap: spacing.md, paddingVertical: spacing.lg },
});
