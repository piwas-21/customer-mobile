import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { approvedImage, customerName, type Product } from '../../api/catalogue';
import type { TenantContext } from '../../core/tenantContext';
import { spacing, typography, useTheme } from '../../ui/theme';
type Props = {
  product: Product;
  context: TenantContext;
  currency: string | null;
  onPress: () => void;
};
function ProductRow({ product, context, currency, onPress }: Props) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const name = customerName(product, i18n.language);
  const image = approvedImage(context, product.imageUrl);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('viewDish', { name })}
      onPress={onPress}
      style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <View style={styles.copy}>
        <Text style={[styles.name, { color: theme.text }]}>{name}</Text>
        {product.description ? (
          <Text numberOfLines={2} style={[styles.description, { color: theme.secondary }]}>
            {product.description}
          </Text>
        ) : null}
        <Text style={[styles.price, { color: theme.text }]}>
          {currency
            ? new Intl.NumberFormat(i18n.language, { style: 'currency', currency }).format(
                product.basePrice,
              )
            : t('priceUnavailable')}
        </Text>
        {!product.isAvailable ? (
          <Text style={{ color: theme.secondary }}>{t('unavailableDish')}</Text>
        ) : null}
      </View>
      {image ? (
        <Image
          source={{ uri: image }}
          accessibilityIgnoresInvertColors
          accessible={false}
          style={styles.image}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={product.id}
        />
      ) : null}
    </Pressable>
  );
}
export default memo(ProductRow);
const styles = StyleSheet.create({
  row: {
    minHeight: 112,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: 18,
  },
  copy: { flex: 1, gap: spacing.sm },
  name: { fontSize: typography.body, fontWeight: '600', flexShrink: 1 },
  description: { fontSize: typography.small, lineHeight: 21 },
  price: { fontSize: typography.body, fontWeight: '600' },
  image: { width: 84, height: 84, borderRadius: 12 },
});
