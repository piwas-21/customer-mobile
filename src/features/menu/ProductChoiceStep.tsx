import { SectionList, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { FlowChoice } from '../../domain/productFlow';
import type { CatalogueChoiceGroup } from '../../domain/catalogueChoices';
import type { ProductSelections } from '../../domain/productComposition';
import type { Selection } from '../../domain/customization';
import ChoiceOption from '../../ui/ChoiceOption';
import { spacing, typography, useTheme } from '../../ui/theme';
export default function ProductChoiceStep({
  choices,
  groups,
  selection,
  disabled,
  onChange,
}: Readonly<{
  choices: readonly FlowChoice[];
  groups: readonly CatalogueChoiceGroup[];
  selection: ProductSelections['groups'];
  disabled: boolean;
  onChange: (id: string, value: Selection) => void;
}>) {
  const { t } = useTranslation();
  const theme = useTheme();
  const fullGroups = new Map(groups.map((group) => [group.id, group]));
  const sections = choices.map((choice) => ({ ...choice, data: choice.group.options }));
  return (
    <SectionList
      sections={sections}
      keyExtractor={({ id }) => id}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      renderSectionHeader={({ section }) => {
        const count = section.data.reduce((total, option) => {
          const quantity = selection[section.sourceId]?.[option.id] ?? 0;
          return (
            total + (section.group.cardinality === 'choices' ? Number(quantity > 0) : quantity)
          );
        }, 0);
        return (
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
              {section.group.label}
            </Text>
            <Text style={{ color: theme.secondary }}>
              {t(section.group.cardinality === 'choices' ? 'choiceLimits' : 'portionLimits', {
                minimum: section.group.min,
                maximum: section.group.max,
              })}
            </Text>
            <Text accessibilityLiveRegion="polite" style={{ color: theme.secondary }}>
              {t(count < section.group.min ? 'choicesRemaining' : 'choicesSelected', {
                count: count < section.group.min ? section.group.min - count : count,
              })}
            </Text>
          </View>
        );
      }}
      renderItem={({ item, section }) => {
        const full = fullGroups.get(section.sourceId);
        if (!full) return null;
        return (
          <ChoiceOption
            option={item}
            group={full}
            selection={selection[section.sourceId] ?? {}}
            disabled={disabled}
            onChange={(value) => onChange(section.sourceId, value)}
          />
        );
      }}
    />
  );
}
const styles = StyleSheet.create({
  list: { gap: spacing.sm, paddingBottom: spacing.md },
  header: { gap: spacing.sm, paddingVertical: spacing.md },
  title: { fontSize: typography.heading, fontWeight: '600' },
});
