import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Button from './Button';
import { spacing, typography, useTheme } from './theme';
type Props = Readonly<{
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  disabled?: boolean;
  canIncrease?: boolean;
  onChange: (value: number) => void;
}>;
export default function QuantityStepper({
  label,
  value,
  minimum,
  maximum,
  disabled = false,
  canIncrease = true,
  onChange,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const valid =
    Number.isSafeInteger(value) &&
    Number.isSafeInteger(minimum) &&
    Number.isSafeInteger(maximum) &&
    minimum >= 0 &&
    minimum <= value &&
    value <= maximum;
  const decrease = valid && !disabled && value > minimum;
  const increase = valid && !disabled && canIncrease && value < maximum;
  const change = (delta: number) => {
    if ((delta < 0 && decrease) || (delta > 0 && increase)) onChange(value + delta);
  };
  return (
    <View style={styles.row}>
      <Button
        label="−"
        accessibilityLabel={t('decreaseQuantity', { name: label })}
        secondary
        disabled={!decrease}
        onPress={() => change(-1)}
      />
      <Text
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={
          valid ? { min: minimum, max: maximum, now: value } : { text: t('unavailableDish') }
        }
        accessibilityState={{ disabled: !valid || disabled }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'increment') change(1);
          if (nativeEvent.actionName === 'decrement') change(-1);
        }}
        style={[styles.value, { color: theme.text }]}
      >
        {valid ? value : '—'}
      </Text>
      <Button
        label="+"
        accessibilityLabel={t('increaseQuantity', { name: label })}
        secondary
        disabled={!increase}
        onPress={() => change(1)}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  value: {
    minWidth: 48,
    minHeight: 48,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: typography.heading,
    fontWeight: '600',
    padding: spacing.sm,
  },
});
