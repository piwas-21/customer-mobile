import { StyleSheet, Text } from 'react-native';
import { spacing, typography, useTheme } from '../../ui/theme';
export default function StepHeading({ text }: Readonly<{ text: string }>) {
  const theme = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>
      {text}
    </Text>
  );
}
const styles = StyleSheet.create({
  heading: { fontSize: typography.heading, fontWeight: '600', paddingVertical: spacing.md },
});
