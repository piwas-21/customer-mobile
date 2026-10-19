import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import ChoiceOption, { type ChoiceSelectionProps } from './ChoiceOption';
import { spacing, typography, useTheme } from './theme';
export default function ChoiceGroup({
  group,
  selection,
  disabled = false,
  onChange,
}: ChoiceSelectionProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const count = Object.values(selection).reduce(
    (total, quantity) =>
      total + (group.cardinality === 'choices' ? Number(quantity > 0) : quantity),
    0,
  );
  return (
    <FlatList
      data={group.options}
      keyExtractor={({ id }) => id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={styles.group}
      ListHeaderComponent={
        <View style={styles.group}>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
            {group.label}
          </Text>
          <Text style={[styles.hint, { color: theme.secondary }]}>
            {t(group.cardinality === 'choices' ? 'choiceLimits' : 'portionLimits', {
              minimum: group.min,
              maximum: group.max,
            })}
          </Text>
          <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: theme.secondary }]}>
            {count < group.min
              ? t('choicesRemaining', { count: group.min - count })
              : t('choicesSelected', { count })}
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <ChoiceOption
          option={item}
          group={group}
          selection={selection}
          disabled={disabled}
          onChange={onChange}
        />
      )}
    />
  );
}
const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  title: { fontSize: typography.heading, fontWeight: '600' },
  hint: { fontSize: typography.body },
});
