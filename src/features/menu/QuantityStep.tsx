import { ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ProductDetail } from '../../api/productDetail';
import ProductDescription from './ProductDescription';
import QuantityStepper from '../../ui/QuantityStepper';
import { spacing } from '../../ui/theme';
export default function QuantityStep({
  product,
  quantity,
  disabled,
  change,
}: Readonly<{
  product: ProductDetail;
  quantity: number;
  disabled: boolean;
  change: (quantity: number) => void;
}>) {
  const { t } = useTranslation();
  return (
    <ScrollView contentContainerStyle={styles.intro}>
      <ProductDescription product={product} />
      <QuantityStepper
        label={t('quantity')}
        value={quantity}
        minimum={1}
        maximum={99}
        disabled={disabled}
        onChange={change}
      />
    </ScrollView>
  );
}
const styles = StyleSheet.create({ intro: { gap: spacing.xl, paddingVertical: spacing.lg } });
