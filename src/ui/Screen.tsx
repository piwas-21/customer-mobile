import { type PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { spacing, useTheme } from './theme';
export default function Screen({
  children,
  bottom = false,
  top = true,
}: Readonly<PropsWithChildren<{ bottom?: boolean; top?: boolean }>>) {
  const theme = useTheme();
  const edges: Edge[] = ['left', 'right'];
  if (top) edges.push('top');
  if (bottom) edges.push('bottom');
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={edges}>
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
