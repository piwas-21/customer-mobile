import { useTranslation } from 'react-i18next';
import type { ProductDraft } from './useProductDraft';
import ReviewList from './ReviewList';
import { selectionReviewRows } from './selectionReview';
export default function ProductReview({
  draft,
  disabled,
}: Readonly<{ draft: ProductDraft; disabled: boolean }>) {
  const { t } = useTranslation();
  const { plan, selection } = draft;
  if (!plan || !selection) return null;
  const rows = selectionReviewRows(
    { ...plan, variations: plan.steps.find((step) => step.kind === 'variation')?.choices },
    selection,
    t,
  );
  return (
    <ReviewList
      rows={rows}
      title={t('reviewDish')}
      quantity={selection.quantity}
      instructions={selection.instructions}
      disabled={disabled}
      change={(instructions) => draft.change({ instructions })}
    />
  );
}
