import type { ProductDetail } from '../../api/productDetail';
import { projectProductComposition } from '../../domain/productComposition';
import { useBasket } from '../basket/BasketProvider';
import useProductDraft from './useProductDraft';
import ProductStep from './ProductStep';
import GuidedFlow from './GuidedFlow';
export default function GuidedProduct({
  product,
  details,
}: Readonly<{
  product: ProductDetail;
  details: ReadonlyMap<string, ProductDetail>;
}>) {
  const draft = useProductDraft(product, details);
  const basket = useBasket();
  return (
    <GuidedFlow
      {...draft}
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
