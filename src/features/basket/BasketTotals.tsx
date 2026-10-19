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
      <MoneySummary value={value} price={price} />
      <Text style={[styles.body, { color: theme.secondary }]}>{t('checkoutPreparing')}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  body: { fontSize: typography.body },
  hint: { fontSize: typography.small },
  totals: { gap: spacing.md, paddingVertical: spacing.lg },
});
