import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Button from './Button';
import { spacing, typography, useTheme } from './theme';
export default function Feedback({
  message,
  loading = false,
  retry,
}: {
  message: string;
  loading?: boolean;
  retry?: (() => void) | undefined;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.box} accessibilityLiveRegion="polite">
      {loading ? <ActivityIndicator color={theme.accent} /> : null}
      <Text style={[styles.message, { color: theme.secondary }]}>{message}</Text>
      {retry ? <Button label={t('tryAgain')} onPress={retry} /> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  box: { paddingVertical: spacing.xl, gap: spacing.md },
  message: { fontSize: typography.body, lineHeight: 26 },
});
