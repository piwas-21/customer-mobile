import { z } from 'zod';
import type { ProductDetail } from '../../api/productDetail';
const MAX_SIDE_PRODUCTS = 100;
const PARALLEL_SIDE_READS = 4;
export function sideProductIds(product: ProductDetail): string[] {
  const direct = (product.suggestedSideItems ?? []).map(({ id }) => id);
  const nested = (product.menuDefinition?.sections ?? []).flatMap((section) =>
    (section.items ?? []).flatMap((item) =>
      (item.suggestedSideItems ?? []).map(({ sideItemProductId }) => sideItemProductId),
    ),
  );
  return z
    .array(z.uuid())
    .max(MAX_SIDE_PRODUCTS)
    .parse(
      [...new Set([...direct, ...nested])].sort((first, second) => first.localeCompare(second)),
    );
}
export async function readSideDetails(
  ids: readonly string[],
  read: (id: string) => Promise<ProductDetail>,
): Promise<ReadonlyMap<string, ProductDetail>> {
  const unique = z
    .array(z.uuid())
    .max(MAX_SIDE_PRODUCTS)
    .parse([...new Set(ids)]);
  const details = new Map<string, ProductDetail>();
  let next = 0;
  async function readNext(): Promise<void> {
    const id = unique[next++];
    if (!id) return;
    const detail = await read(id);
    if (detail.id !== id) throw new Error('Wrong side product');
    details.set(id, detail);
    return readNext();
  }
  const workers = Array.from({ length: Math.min(PARALLEL_SIDE_READS, unique.length) }, readNext);
  await Promise.all(workers);
  return details;
}
