import type { ReorderSeed } from '../../domain/reorder';
import type { ProductDetail } from '../../api/productDetail';
import { projectProductComposition } from '../../domain/productComposition';
import { useBasket } from '../basket/BasketProvider';
import useProductDraft from './useProductDraft';
import ProductStep from './ProductStep';
import GuidedFlow from './GuidedFlow';
export default function GuidedProduct({
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
  const draft = useProductDraft(product, details, seed);
  const basket = useBasket();
  return (
    <GuidedFlow
      {...draft}
      onBasketNavigation={onBasketNavigation}
      available={Boolean(draft.plan && draft.step && draft.selection)}
      total={draft.plan?.steps.length ?? 0}
      review={draft.step?.kind === 'review'}
      submit={() =>
        draft.selection
          ? basket.add(projectProductComposition(product, details, draft.selection))
          : Promise.reject(new Error('Ordering draft unavailable'))
      }
    >
      <ProductStep product={product} draft={draft} disabled={basket.busy} />
    </GuidedFlow>
  );
}
