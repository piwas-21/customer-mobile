import type { components } from '../api/generated';
import type { ProductDetail } from '../api/productDetail';
import { customerName } from '../api/catalogue';
import { inDisplayOrder } from './catalogueChoices';

export type VariationSource = Pick<ProductDetail, 'variations' | 'hideBaseProduct'>;
export type VariationChoice = Readonly<{ id: string | null; label: string }>;
export type VariationChoices = Readonly<{
  options: readonly VariationChoice[];
  defaultId: string | null;
}>;

export function variationChoices(
  source: VariationSource,
  locale: string,
  baseLabel: string,
): VariationChoices {
  const variations = source.variations ?? [];
  if (new Set(variations.map(({ id }) => id)).size !== variations.length)
    throw new Error('Unsupported variation identities');
  const active = inDisplayOrder(variations.filter(({ isActive }) => isActive));
  const options: VariationChoice[] = active.map((variation) => ({
    id: variation.id,
    label: customerName(variation, locale),
  }));
  // The server restores the base row when no active variation remains.
  if (!source.hideBaseProduct || !active.length) options.unshift({ id: null, label: baseLabel });
  return { options, defaultId: active[0]?.id ?? null };
}

export function projectVariation(
  source: VariationSource,
  selectedId: string | null,
): Pick<components['schemas']['AddToBasketDto'], 'productVariationId'> {
  const choices = variationChoices(source, '', '');
  if (!choices.options.some(({ id }) => id === selectedId))
    throw new Error('Unavailable variation');
  return { productVariationId: selectedId };
}
