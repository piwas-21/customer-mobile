import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { spacing, typography, useTheme } from './theme';
type Props = Readonly<{
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  secondary?: boolean;
  destructive?: boolean;
}>;
export default function Button({
  label,
  accessibilityLabel,
  onPress,
  disabled = false,
  busy = false,
  secondary = false,
  destructive = false,
}: Props) {
  const theme = useTheme();
  const outlined = secondary || destructive;
  const baseForeground = secondary ? theme.text : theme.onAccent;
  const foreground = destructive ? theme.danger : baseForeground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: outlined ? theme.surface : theme.accent,
          borderColor: destructive ? theme.danger : theme.border,
          opacity: pressed || disabled ? 0.65 : 1,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <Text style={[styles.label, { color: foreground }]}>{label}</Text>
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
