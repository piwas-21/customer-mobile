import { ScrollView, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { customerName } from '../../api/catalogue';
import useProduct from './useProduct';
import Screen from '../../ui/Screen';
import Feedback from '../../ui/Feedback';
import { spacing, typography, useTheme } from '../../ui/theme';
export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { product, loading, unavailable } = useProduct(id);
  if (!product)
    return (
      <Screen>
        <Feedback loading={loading} message={unavailable ? t('menuUnavailable') : t('loading')} />
      </Screen>
    );
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
          {customerName(product, i18n.language)}
        </Text>
        {product.description ? (
          <Text style={[styles.body, { color: theme.secondary }]}>{product.description}</Text>
        ) : null}
        <Text style={[styles.body, { color: theme.secondary }]}>
          {product.allergens?.length
            ? t('recordedAllergens', { allergens: product.allergens.join(', ') })
            : t('allergensUnknown')}
        </Text>
        <Feedback message={t('webHelp')} />
      </ScrollView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingVertical: spacing.lg },
  title: { fontSize: typography.title, fontWeight: '700' },
  body: { fontSize: typography.body, lineHeight: 27 },
});
