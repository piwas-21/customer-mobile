import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ProductDetail } from '../../api/productDetail';
import { spacing, typography, useTheme } from '../../ui/theme';
export default function ProductDescription({ product }: Readonly<{ product: ProductDetail }>) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={styles.copy}>
      {product.description ? (
        <Text style={[styles.body, { color: theme.secondary }]}>{product.description}</Text>
      ) : null}
      <Text style={[styles.body, { color: theme.secondary }]}>
        {product.allergens?.length
          ? t('recordedAllergens', { allergens: product.allergens.join(', ') })
          : t('allergensUnknown')}
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  copy: { gap: spacing.md },
  body: { fontSize: typography.body, lineHeight: 27 },
});
