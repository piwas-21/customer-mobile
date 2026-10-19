import type { ProductDetail } from '../../api/productDetail';
import type { ProductDraft } from './useProductDraft';
import QuantityStep from './QuantityStep';
import ItemChoiceStep from './ItemChoiceStep';
import ProductReview from './ProductReview';
export default function ProductStep({
  product,
  draft,
  disabled,
}: Readonly<{
  product: ProductDetail;
  draft: ProductDraft;
  disabled: boolean;
}>) {
  const { step, selection, plan, change } = draft;
  if (!step || !selection || !plan) return null;
  switch (step.kind) {
    case 'quantity':
      return (
        <QuantityStep
          product={product}
          quantity={selection.quantity}
          disabled={disabled}
          change={(quantity) => change({ quantity })}
        />
      );
    case 'variation':
    case 'groups':
    case 'sides':
      return (
        <ItemChoiceStep
          step={step}
          groups={plan.groups}
          selection={selection}
          disabled={disabled}
          change={change}
        />
      );
    case 'review':
      return <ProductReview draft={draft} disabled={disabled} />;
  }
}
