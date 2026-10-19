import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { spacing, typography, useTheme } from './theme';
type Row = Readonly<{ label: string; amount: number }>;
export default function MoneySummary({
  rows,
  total,
  price,
}: Readonly<{ rows: readonly Row[]; total: number; price: (amount: number) => string }>) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={styles.summary}>
      {rows.map((row) => (
        <Text key={row.label} style={[styles.body, { color: theme.text }]}>
          {row.label}: {price(row.amount)}
        </Text>
      ))}
      <Text style={[styles.total, { color: theme.text }]}>
        {t('total')}: {price(total)}
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  summary: { gap: spacing.md },
  body: { fontSize: typography.body },
  total: { fontSize: typography.heading, fontWeight: '700' },
});
