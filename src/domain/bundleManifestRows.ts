import type { ProductDetail } from '../api/productDetail';
import { componentSource } from './bundleComponent';
import { inDisplayOrder } from './catalogueChoices';
import { defaultProductRows, type ProductStepKind } from './productManifestRows';
export const componentStepKinds: Readonly<Record<ProductStepKind, string>> = {
  ProductVariation: 'BundleComponentVariation',
  ProductIngredient: 'BundleComponentIngredient',
  ProductSauce: 'BundleComponentSauce',
  ProductCustomizationGroup: 'BundleComponentCustomizationGroup',
  ProductSuggestedSide: 'BundleComponentSide',
};
export type BundleManifestRow = Readonly<{
  kind: string;
  sectionId: string;
  rowId: string | null;
  productId: string | null;
  scopeId: string | null;
  role: string;
  order: number;
  label?: string | null;
  parentComponentId?: string | null;
}>;
export function defaultBundleRows(product: ProductDetail): BundleManifestRow[] {
  const sections = inDisplayOrder(product.menuDefinition?.sections ?? []);
  const rows: BundleManifestRow[] = sections.map((section, order) => ({
    kind: 'BundleSection',
    sectionId: section.id,
    rowId: null,
    productId: null,
    scopeId: null,
    role: section.isRequired ? 'RequiredChoice' : 'Extra',
    order,
  }));
  const rowIds = new Set<string>();
  let order = rows.length;
  for (const section of sections) {
    for (const item of inDisplayOrder(section.items ?? [])) {
      if (rowIds.has(item.id)) throw new Error('Duplicate bundle row identity');
      rowIds.add(item.id);
      const componentRows = defaultProductRows(componentSource(item)).filter(
        (row) => row.kind !== 'ProductVariation' || !item.productVariationId,
      );
      const start = order;
      for (const row of componentRows) {
        rows.push({
          kind: componentStepKinds[row.kind],
          sectionId: section.id,
          rowId: item.id,
          productId: item.productId,
          scopeId: row.targetId,
          role: row.role,
          order: start + row.order,
        });
        order = Math.max(order, start + row.order + 1);
      }
    }
  }
  return rows;
}
export function bundleRowKey(row: BundleManifestRow): string {
  return `${row.kind}:${row.sectionId}:${row.rowId ?? ''}:${row.scopeId ?? ''}`;
}
export function bundleScreenKey(row: BundleManifestRow): string {
  return `${row.kind}:${row.sectionId}:${row.rowId ?? ''}:${row.role}:${row.order}`;
}
export function globalBundlePicker(row: BundleManifestRow): boolean {
  return ['BundleComponentVariation', 'BundleComponentSauce'].includes(row.kind);
}
