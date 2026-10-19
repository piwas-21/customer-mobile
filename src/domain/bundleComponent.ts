import type { z } from 'zod';
import type { bundleSectionItemSchema } from '../api/bundleDetail';
import type { SelectionSource } from './selectionComposition';
export type BundleComponent = z.infer<typeof bundleSectionItemSchema>;
export function componentSource(item: BundleComponent): SelectionSource {
  return {
    ...item,
    suggestedSideItems: (item.suggestedSideItems ?? []).map((side) => ({
      id: side.sideItemProductId,
      suggestedSideItemId: side.id,
      name: side.sideItemProductName,
      price: side.sideItemBasePrice,
      type: side.sideItemProductType,
      isRequired: side.isRequired,
      displayOrder: side.displayOrder,
    })),
  };
}
