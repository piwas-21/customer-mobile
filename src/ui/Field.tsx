import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { spacing, typography, useTheme } from './theme';
type Props = TextInputProps & { label: string; error?: string };
export default function Field({ label, error, ...props }: Props) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        accessibilityHint={error}
        placeholderTextColor={theme.secondary}
        style={[
          styles.input,
          {
            color: theme.text,
            borderColor: error ? theme.danger : theme.border,
            backgroundColor: theme.surface,
          },
        ]}
      />
      {error ? (
        <Text accessibilityRole="alert" style={{ color: theme.danger }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  field: { gap: spacing.sm },
  label: { fontSize: typography.body },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
    fontSize: typography.body,
    textAlign: 'auto',
  },
});
