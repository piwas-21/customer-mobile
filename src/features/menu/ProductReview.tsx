import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ProductDraft } from './useProductDraft';
import Field from '../../ui/Field';
import { selectionReviewRows } from './selectionReview';
import { spacing, typography, useTheme } from '../../ui/theme';
export default function ProductReview({
  draft,
  disabled,
}: Readonly<{ draft: ProductDraft; disabled: boolean }>) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { plan, selection } = draft;
  if (!plan || !selection) return null;
  const rows = selectionReviewRows(
    { ...plan, variations: plan.steps.find((step) => step.kind === 'variation')?.choices },
    selection,
    t,
  );
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
