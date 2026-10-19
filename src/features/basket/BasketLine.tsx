import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { BasketRow } from './basketRows';
import Button from '../../ui/Button';
import { spacing, typography, useTheme } from '../../ui/theme';
export default function BasketLine({
  row,
  price,
  edit,
  disabled,
}: Readonly<{
  row: BasketRow;
  price: (amount: number) => string;
  edit: () => void;
  disabled: boolean;
}>) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={[styles.line, row.nested && styles.nested, { borderColor: theme.border }]}>
      <Text style={[styles.body, { color: theme.text }]}>
        {t('selectedQuantity', { name: row.name ?? t('itemDetails'), quantity: row.quantity })}
      </Text>
      {row.amount !== null ? (
        <Text style={[styles.body, { color: theme.text }]}>{price(row.amount)}</Text>
      ) : null}
      {stableNames(row.description).map(({ name: detail, key }) => (
        <Text key={key} style={[styles.hint, { color: theme.secondary }]}>
          {detail}
        </Text>
      ))}
      {stableNames(row.removed).map(({ name, key }) => (
        <Text key={key} style={[styles.hint, { color: theme.secondary }]}>
          {t('withoutIngredient', { name })}
        </Text>
      ))}
      {row.itemId ? (
        <Button
          secondary
          label={t('editBasketItem', { name: row.name ?? t('itemDetails') })}
          onPress={edit}
          disabled={disabled}
        />
      ) : null}
      {row.instructions ? (
        <Text style={[styles.hint, { color: theme.secondary }]}>{row.instructions}</Text>
      ) : null}
    </View>
  );
}
function stableNames(names: readonly string[]) {
  const counts = new Map<string, number>();
  return names.map((name) => {
    const occurrence = counts.get(name) ?? 0;
    counts.set(name, occurrence + 1);
    return { name, key: JSON.stringify([name, occurrence]) };
  });
}
const styles = StyleSheet.create({
  body: { fontSize: typography.body },
  hint: { fontSize: typography.small },
  line: { gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: 1 },
  nested: { paddingStart: spacing.lg },
});
