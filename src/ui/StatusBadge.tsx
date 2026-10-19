import { StyleSheet, Text } from 'react-native';
import { spacing, typography, useTheme } from './theme';
export default function StatusBadge({
  label,
  tone = 'neutral',
}: Readonly<{
  label: string;
  tone?: 'neutral' | 'positive' | 'danger';
}>) {
  const theme = useTheme();
  const color = tone === 'danger' ? theme.danger : theme.text;
  return (
    <Text
      accessibilityLiveRegion="polite"
      style={[
        styles.badge,
        {
          color,
          borderColor: tone === 'positive' ? theme.accent : theme.border,
          backgroundColor: theme.surface,
        },
      ]}
    >
      {label}
    </Text>
  );
}
const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: spacing.sm,
    padding: spacing.sm,
    fontSize: typography.body,
  },
});
