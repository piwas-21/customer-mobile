import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { CatalogueChoice, CatalogueChoiceGroup } from '../domain/catalogueChoices';
import { changeChoice, type Selection } from '../domain/customization';
import { toggleChoice } from '../domain/choiceInteraction';
import QuantityStepper from './QuantityStepper';
import { spacing, typography, useTheme } from './theme';
export type ChoiceSelectionProps = Readonly<{
  group: CatalogueChoiceGroup;
  selection: Selection;
  disabled?: boolean;
  onChange: (selection: Selection) => void;
}>;
export default function ChoiceOption({
  option,
  group,
  selection,
  disabled = false,
  onChange,
}: ChoiceSelectionProps & Readonly<{ option: CatalogueChoice }>) {
  const theme = useTheme();
  const { t } = useTranslation();
  const radio = group.min === 1 && group.max === 1;
  const quantity = selection[option.id] ?? 0;
  const selected = quantity > 0;
  const unavailable = disabled || !option.available;
  const more = changeChoice(group, selection, option.id, 1) !== selection;
  return (
    <View
      key={option.id}
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: selected ? theme.accent : theme.border,
        },
      ]}
    >
      <Pressable
        accessibilityRole={radio ? 'radio' : 'checkbox'}
        accessibilityLabel={option.label}
        accessibilityState={{ checked: selected, disabled: unavailable }}
        disabled={unavailable}
        onPress={() => onChange(toggleChoice(group, selection, option.id))}
        style={styles.option}
      >
        <Text style={[styles.label, { color: unavailable ? theme.secondary : theme.text }]}>
          {option.label}
        </Text>
        <Text accessible={false} style={[styles.mark, { color: theme.accent }]}>
          {selected ? '✓' : '○'}
        </Text>
      </Pressable>
      {selected && group.repeat && option.maxQuantity > 1 ? (
        <View style={styles.quantity}>
          <QuantityStepper
            label={t('optionQuantity', { name: option.label })}
            value={quantity}
            minimum={Math.max(1, option.minimumQuantity ?? 0)}
            maximum={option.maxQuantity}
            disabled={unavailable}
            canIncrease={more}
            onChange={(value) =>
              onChange(changeChoice(group, selection, option.id, value - quantity))
            }
          />
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16 },
  option: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  label: { flex: 1, fontSize: typography.body },
  mark: { fontSize: typography.heading },
  quantity: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
});
