import { useTranslation } from 'react-i18next';
import type { ProductDetail } from '../../api/productDetail';
import type { BundleDraft } from './useBundleDraft';
import QuantityStep from './QuantityStep';
import ProductChoiceStep from './ProductChoiceStep';
import ItemChoiceStep from './ItemChoiceStep';
import BundleReview from './BundleReview';
import Feedback from '../../ui/Feedback';
export default function BundleStep({
  product,
  draft,
  disabled,
}: Readonly<{
  product: ProductDetail;
  draft: BundleDraft;
  disabled: boolean;
}>) {
  const { t } = useTranslation();
  const { plan, selection, step, change } = draft;
  if (!plan || !selection || !step) return null;
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
    case 'section':
      return step.active ? (
        <ProductChoiceStep
          choices={[{ sourceId: step.group.id, group: step.group }]}
          groups={plan.groups}
          selection={selection.sections}
          disabled={disabled}
          onChange={(id, value) => change({ sections: { ...selection.sections, [id]: value } })}
        />
      ) : (
        <Feedback message={t('bundleParentRequired')} />
      );
    case 'component': {
      const component = selection.components[step.rowId];
      if (!component) return <Feedback message={t('menuUnavailable')} />;
      return (
        <ItemChoiceStep
          heading={step.label}
          step={step.step}
          groups={step.groups}
          selection={component}
          disabled={disabled}
          change={(patch) =>
            change({
              components: { ...selection.components, [step.rowId]: { ...component, ...patch } },
            })
          }
        />
      );
    }
    case 'review':
      return <BundleReview draft={draft} disabled={disabled} />;
  }
}
