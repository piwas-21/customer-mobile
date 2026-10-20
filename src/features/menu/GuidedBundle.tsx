import type { ReorderSeed } from '../../domain/reorder';
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
  seed,
  onBasketNavigation,
}: Readonly<{
  product: ProductDetail;
  details: ReadonlyMap<string, ProductDetail>;
  seed?: ReorderSeed | undefined;
  onBasketNavigation?: ((navigate: () => void) => void) | undefined;
}>) {
  const draft = useBundleDraft(product, details, seed);
  const basket = useBasket();
  const { t } = useTranslation();
  return (
    <GuidedFlow
      {...draft}
      onBasketNavigation={onBasketNavigation}
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
