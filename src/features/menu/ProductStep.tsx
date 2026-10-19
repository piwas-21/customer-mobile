import { ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ProductDetail } from '../../api/productDetail';
import type { ProductDraft } from './useProductDraft';
import QuantityStepper from '../../ui/QuantityStepper';
import VariationPicker from '../../ui/VariationPicker';
import ProductDescription from './ProductDescription';
import ProductChoiceStep from './ProductChoiceStep';
import ProductSideStep from './ProductSideStep';
import ProductReview from './ProductReview';
import { spacing } from '../../ui/theme';
export default function ProductStep({
  product,
  draft,
  disabled,
}: Readonly<{
  product: ProductDetail;
  draft: ProductDraft;
  disabled: boolean;
}>) {
  const { t } = useTranslation();
  const { step, selection, plan, change } = draft;
  if (!step || !selection || !plan) return null;
  switch (step.kind) {
    case 'quantity':
      return (
        <ScrollView contentContainerStyle={styles.intro}>
          <ProductDescription product={product} />
          <QuantityStepper
            label={t('quantity')}
            value={selection.quantity}
            minimum={1}
            maximum={99}
            disabled={disabled}
            onChange={(quantity) => change({ quantity })}
          />
        </ScrollView>
      );
    case 'variation':
      return (
        <VariationPicker
          choices={step.choices}
          value={selection.variationId}
          label={step.label ?? t('dishSize')}
          disabled={disabled}
          onChange={(variationId) => change({ variationId })}
        />
      );
    case 'groups':
      return (
        <ProductChoiceStep
          choices={step.choices}
          groups={plan.groups}
          selection={selection.groups}
          disabled={disabled}
          onChange={(id, value) => change({ groups: { ...selection.groups, [id]: value } })}
        />
      );
    case 'sides':
      return (
        <ProductSideStep
          choices={step.choices}
          selection={selection.sides}
          disabled={disabled}
          onChange={(id, value) => {
            const sides = { ...selection.sides };
            if (value) sides[id] = value;
            else delete sides[id];
            change({ sides });
          }}
        />
      );
    case 'review':
      return <ProductReview draft={draft} disabled={disabled} />;
  }
}
const styles = StyleSheet.create({ intro: { gap: spacing.xl, paddingVertical: spacing.lg } });
