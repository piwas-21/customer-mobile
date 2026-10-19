import type { ReactNode } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { SelectionReviewRow } from './selectionReview';
import Field from '../../ui/Field';
import { spacing, typography, useTheme } from '../../ui/theme';
export default function ReviewList<T extends SelectionReviewRow>({
  rows,
  title,
  quantity,
  instructions,
  disabled,
  change,
  renderRow,
}: Readonly<{
  rows: readonly T[];
  title: string;
  quantity: number;
  instructions: string;
  disabled: boolean;
  change: (instructions: string) => void;
  renderRow?: (row: T) => ReactNode;
}>) {
  const theme = useTheme();
  const { t } = useTranslation();
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
            {title}
          </Text>
          <Text style={[styles.body, { color: theme.text }]}>
            {t('selectedQuantity', { name: t('quantity'), quantity })}
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <>
          {renderRow?.(item) ?? (
            <Text style={[styles.body, { color: theme.text }]}>{item.label}</Text>
          )}
        </>
      )}
      ListFooterComponent={
        <View style={styles.footer}>
          <Field
            label={t('orderNotes')}
            value={instructions}
            multiline
            maxLength={500}
            editable={!disabled}
            onChangeText={change}
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
