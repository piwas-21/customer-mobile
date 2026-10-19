import { type PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing, useTheme } from './theme';
export default function Screen({
  children,
  bottom = false,
}: Readonly<PropsWithChildren<{ bottom?: boolean }>>) {
  const theme = useTheme();
  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.background }]}
      edges={bottom ? ['left', 'right', 'top', 'bottom'] : ['left', 'right', 'top']}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.content}
      >
        {children}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing.lg, gap: spacing.md },
});
