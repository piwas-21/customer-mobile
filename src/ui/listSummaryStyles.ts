import { StyleSheet } from 'react-native';
import { spacing, typography } from './theme';
export const listSummaryStyles = StyleSheet.create({
  content: { gap: spacing.md },
  row: { gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: typography.heading, fontWeight: '600' },
  body: { fontSize: typography.body, lineHeight: 26 },
});
