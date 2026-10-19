import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { SideChoice, SideSelection } from '../../domain/sideChoices';
import type { ProductSelections } from '../../domain/productComposition';
import {
  variationGroup,
  variationSelection,
  selectedVariation,
} from '../../domain/variationSelection';
import ChoiceOption from '../../ui/ChoiceOption';
import QuantityStepper from '../../ui/QuantityStepper';
import { spacing, typography, useTheme } from '../../ui/theme';
export default function ProductSideStep({
  choices,
  selection,
  disabled,
  onChange,
}: Readonly<{
  choices: readonly SideChoice[];
  selection: ProductSelections['sides'];
  disabled: boolean;
  onChange: (id: string, value: SideSelection | null) => void;
}>) {
  const { t } = useTranslation();
  const theme = useTheme();
  const sections = choices.map((side) => {
    const group = variationGroup(side.variations ?? { options: [], defaultId: null }, side.label);
    return {
      key: side.membershipId,
      side,
      group,
      data: selection[side.membershipId] ? group.options : [],
    };
  });
  return (
    <SectionList
      sections={sections}
      keyExtractor={({ id }) => id}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={styles.list}
      renderSectionHeader={({ section: { side } }) => {
        const value = selection[side.membershipId];
        const unavailable = disabled || !side.available;
        return (
          <View style={[styles.header, { borderColor: theme.border }]}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={side.label}
              accessibilityHint={side.required ? t('requiredSide') : undefined}
              accessibilityState={{
                checked: Boolean(value),
                disabled: unavailable || side.required,
              }}
              disabled={unavailable || side.required}
              style={styles.toggle}
              onPress={() =>
                onChange(
                  side.membershipId,
                  value ? null : { quantity: 1, variationId: side.variations?.defaultId ?? null },
                )
              }
            >
              <Text style={[styles.title, { color: theme.text }]}>{side.label}</Text>
              <Text accessible={false} style={{ color: theme.accent }}>
                {value ? '✓' : '○'}
              </Text>
            </Pressable>
            {side.required ? (
              <Text style={{ color: theme.secondary }}>{t('requiredSide')}</Text>
            ) : null}
            {!side.available ? (
              <Text style={{ color: theme.secondary }}>{t('unavailableDish')}</Text>
            ) : null}
            {value ? (
              <QuantityStepper
                label={t('optionQuantity', { name: side.label })}
                value={value.quantity}
                minimum={1}
                maximum={99}
                disabled={unavailable}
                onChange={(quantity) => onChange(side.membershipId, { ...value, quantity })}
              />
            ) : null}
          </View>
        );
      }}
      renderItem={({ item, section }) => {
        const value = selection[section.side.membershipId];
        if (!value) return null;
        return (
          <ChoiceOption
            option={item}
            group={section.group}
            selection={variationSelection(value.variationId)}
            disabled={disabled}
            onChange={(next) => {
              const variationId = selectedVariation(next);
              if (variationId !== undefined)
                onChange(section.side.membershipId, { ...value, variationId });
            }}
          />
        );
      }}
    />
  );
}
const styles = StyleSheet.create({
  list: { gap: spacing.sm, paddingBottom: spacing.md },
  header: { gap: spacing.sm, paddingVertical: spacing.md, borderTopWidth: 1 },
  toggle: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { flex: 1, fontSize: typography.heading, fontWeight: '600' },
});
