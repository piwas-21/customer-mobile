import { ScrollView, StyleSheet, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { canUse } from '../../core/capabilities';
import { useBasket } from '../basket/BasketProvider';
import useBootstrap from '../restaurant/useBootstrap';
import ProductConfiguration from './ProductConfiguration';
import ProductDescription from './ProductDescription';
import { customerName } from '../../api/catalogue';
import useProduct from './useProduct';
import Screen from '../../ui/Screen';
import Feedback from '../../ui/Feedback';
import { spacing, typography, useTheme } from '../../ui/theme';
export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const basket = useBasket();
  const bootstrap = useBootstrap();
  const channel = basket.basket?.orderType ?? undefined;
  const { product, loading, unavailable } = useProduct(id, channel);
  if (!product)
    return (
      <Screen bottom top={false}>
        <Feedback loading={loading} message={unavailable ? t('menuUnavailable') : t('loading')} />
      </Screen>
    );
  return (
    <Screen bottom top={false}>
      <>
        <Stack.Screen options={{ title: customerName(product, i18n.language) }} />
        {canUse(bootstrap.data, 'ordering') ? (
          <ProductConfiguration product={product} channel={channel} />
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
              {customerName(product, i18n.language)}
            </Text>
            <ProductDescription product={product} />
            <Feedback message={t('webHelp')} />
          </ScrollView>
        )}
      </>
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingVertical: spacing.lg },
  title: { fontSize: typography.title, fontWeight: '700' },
});
