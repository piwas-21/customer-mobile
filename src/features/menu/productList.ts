import { customerName, type Product } from '../../api/catalogue';
export function visibleProducts(
  pages: readonly { items: readonly Product[] }[],
  search: string,
  locale: string,
): Product[] {
  const seen = new Set<string>();
  const needle = search.trim().toLocaleLowerCase(locale);
  const result: Product[] = [];
  for (const page of pages) {
    for (const product of page.items) {
      if (!product.isActive || product.isComponent || seen.has(product.id)) continue;
      seen.add(product.id);
      if (customerName(product, locale).toLocaleLowerCase(locale).includes(needle))
        result.push(product);
    }
  }
  return result;
}
