import { canBrowse } from '../../core/capabilities';
import useBootstrap from '../restaurant/useBootstrap';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { customerName, productSchema } from '../../api/catalogue';
import Screen from '../../ui/Screen';
import Feedback from '../../ui/Feedback';
import { spacing, typography, useTheme } from '../../ui/theme';
import { useRestaurant } from '../restaurant/RestaurantProvider';
export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { context, client } = useRestaurant();
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const bootstrap = useBootstrap();
  const validId = z.uuid().safeParse(id);
  const query = useQuery({
    queryKey: [
      context?.environment,
      context?.tenant.id,
      'public',
      'product',
      id,
      i18n.language,
      context?.generation,
    ],
    queryFn: () => {
      if (!client || !context || !validId.success) throw new Error('Invalid product');
      return client.request(context, `/api/Products/${validId.data}`, productSchema, {
        locale: i18n.language,
      });
    },
    enabled: Boolean(context && client && validId.success && canBrowse(bootstrap.data)),
    retry: 1,
  });
  const product = canBrowse(bootstrap.data) ? query.data : undefined;
  if (!product)
    return (
      <Screen>
        <Feedback
          loading={(bootstrap.isPending || query.isFetching) && validId.success}
          message={
            query.isError || bootstrap.isError || !canBrowse(bootstrap.data) || !validId.success
              ? t('menuUnavailable')
              : t('loading')
          }
        />
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
