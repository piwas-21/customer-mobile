import type { ProductDetail } from '../../api/productDetail';
import { projectBundleComposition } from '../../domain/bundleComposition';
import { useTranslation } from 'react-i18next';
import { useBasket } from '../basket/BasketProvider';
import useBundleDraft from './useBundleDraft';
import BundleStep from './BundleStep';
import GuidedFlow from './GuidedFlow';
import Feedback from '../../ui/Feedback';
export default function GuidedBundle({
  product,
  details,
}: Readonly<{
  product: ProductDetail;
  details: ReadonlyMap<string, ProductDetail>;
}>) {
  const draft = useBundleDraft(product, details);
  const basket = useBasket();
  const { t } = useTranslation();
  return (
    <GuidedFlow
      {...draft}
      available={Boolean(draft.plan && draft.step && draft.selection)}
      total={draft.steps.length}
      review={draft.step?.kind === 'review'}
      submit={() =>
        draft.selection
          ? basket.add(projectBundleComposition(product, details, draft.selection))
          : Promise.reject(new Error('Ordering draft unavailable'))
      }
    >
      {draft.unsupported ? <Feedback message={t('webHelp')} /> : null}
      <BundleStep product={product} draft={draft} disabled={basket.busy} />
    </GuidedFlow>
  );
}
