import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ProductDraft } from './useProductDraft';
import Field from '../../ui/Field';
import { spacing, typography, useTheme } from '../../ui/theme';
export default function ProductReview({
  draft,
  disabled,
}: Readonly<{ draft: ProductDraft; disabled: boolean }>) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { plan, selection } = draft;
  if (!plan || !selection) return null;
  const rows: { id: string; label: string }[] = [];
  for (const step of plan.steps) {
    if (step.kind === 'variation') {
      const choice = step.choices.options.find(({ id }) => id === selection.variationId);
      if (choice) rows.push({ id: step.id, label: choice.label });
    }
    if (step.kind === 'sides')
      for (const side of step.choices) {
        const selected = selection.sides[side.membershipId];
        if (!selected) continue;
        const size = side.variations?.options.find(({ id }) => id === selected.variationId)?.label;
        rows.push({
          id: side.membershipId,
          label: t('selectedQuantity', {
            name: size ? `${side.label} · ${size}` : side.label,
            quantity: selected.quantity,
          }),
        });
      }
  }
  for (const group of plan.groups)
    for (const option of group.options) {
      const quantity = selection.groups[group.id]?.[option.id] ?? 0;
      if (quantity > 0)
        rows.push({
          id: `${group.id}:${option.id}`,
          label: t('selectedQuantity', { name: option.label, quantity }),
        });
      else if (group.kind === 'recipe' && (group.defaults[option.id] ?? 0) > 0)
        rows.push({
          id: `${group.id}:${option.id}`,
          label: t('withoutIngredient', { name: option.label }),
        });
    }
  return (
    <FlatList
      data={rows}
      keyExtractor={({ id }) => id}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ListHeaderComponent={
        <View style={styles.list}>
          <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>
            {t('reviewDish')}
          </Text>
          <Text style={[styles.body, { color: theme.text }]}>
            {t('selectedQuantity', { name: t('quantity'), quantity: selection.quantity })}
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <Text style={[styles.body, { color: theme.text }]}>{item.label}</Text>
      )}
      ListFooterComponent={
        <View style={styles.footer}>
          <Field
            label={t('orderNotes')}
            value={selection.instructions}
            multiline
            maxLength={500}
            editable={!disabled}
            onChangeText={(instructions) => draft.change({ instructions })}
          />
          <Text style={[styles.body, { color: theme.secondary }]}>{t('orderPriceHint')}</Text>
        </View>
      }
    />
  );
}
const styles = StyleSheet.create({
  list: { gap: spacing.md, paddingVertical: spacing.sm },
  footer: { gap: spacing.lg, paddingVertical: spacing.lg },
  heading: { fontSize: typography.heading, fontWeight: '600' },
  body: { fontSize: typography.body },
});
