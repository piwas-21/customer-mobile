import { basketAddInputSchema, type BasketAddInput } from '../api/basketRequest';
import type { ProductDetail } from '../api/productDetail';
import type { CatalogueChoiceGroup } from './catalogueChoices';
import type { Selection } from './customization';
import { productDecisions } from './productManifest';
import {
  projectItemSelections,
  selectionComposition,
  type ItemSelections,
  type CompositionLabels,
} from './selectionComposition';
export type { CompositionLabels } from './selectionComposition';

export type ProductSelections = ItemSelections &
  Readonly<{
    quantity: number;
  }>;
export function productComposition(
  product: ProductDetail,
  details: ReadonlyMap<string, ProductDetail>,
  locale: string,
  labels: CompositionLabels,
) {
  requireOrderableProduct(product);
  const decisions = productDecisions(product);
  return {
    decisions,
    ...selectionComposition(product, details, locale, labels),
  };
}
export function requireOrderableProduct(product: ProductDetail): void {
  if (
    !product.isActive ||
    !product.isAvailable ||
    !product.availability.canOrder ||
    product.isComponent ||
    product.menuDefinition ||
    !['mainItem', 'beverage', 'dessert', 'sauce', 'addOn'].includes(product.type)
  )
    throw new Error('Product unavailable for standalone ordering');
}
export function projectProductComposition(
  product: ProductDetail,
  details: ReadonlyMap<string, ProductDetail>,
  selection: ProductSelections,
): BasketAddInput {
  productComposition(product, details, '', {
    base: '',
    ingredients: '',
    sauces: '',
  });
  return basketAddInputSchema.parse({
    productId: product.id,
    quantity: selection.quantity,
    ...projectItemSelections(product, details, selection),
  });
}
export function defaultGroupSelections(
  groups: readonly CatalogueChoiceGroup[],
): Record<string, Selection> {
  return Object.fromEntries(groups.map(({ id, defaults }) => [id, { ...defaults }]));
}
