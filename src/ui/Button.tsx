import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { spacing, typography, useTheme } from './theme';
type Props = Readonly<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  secondary?: boolean;
}>;
export default function Button({
  label,
  onPress,
  disabled = false,
  busy = false,
  secondary = false,
}: Props) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: secondary ? theme.surface : theme.accent,
          borderColor: theme.border,
          opacity: pressed || disabled ? 0.65 : 1,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? theme.text : theme.onAccent} />
      ) : (
        <Text style={[styles.label, { color: secondary ? theme.text : theme.onAccent }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: { fontSize: typography.body, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
});
