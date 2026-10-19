import type { ProductDetail } from '../api/productDetail';
import { bundleScreenKey, globalBundlePicker, type BundleManifestRow } from './bundleManifestRows';
export function validateBundleScreens(
  rows: readonly BundleManifestRow[],
  product: ProductDetail,
): void {
  const sections = new Map(
    rows.filter((row) => row.kind === 'BundleSection').map((row) => [row.sectionId, row]),
  );
  const ownerSections = new Map(
    (product.menuDefinition?.sections ?? []).flatMap((section) =>
      (section.items ?? []).map((item) => [item.id, section.id] as const),
    ),
  );
  const orders = new Map<number, string>();
  const labels = new Map<string, string | null>();
  const pickers = new Map<string, string>();
  const required = requiredOrders(rows);
  for (const row of rows) {
    recordScreen(row, orders, labels);
    validatePicker(row, pickers);
    const section = sections.get(row.sectionId);
    if (row.kind !== 'BundleSection' && (!section || section.order >= row.order))
      throw new Error('Component choices must follow their section');
    if (row.kind === 'BundleComponentVariation' && row.label != null && section?.role !== 'Dish')
      throw new Error('Variation label requires a Dish section');
    validateDependency(row, sections, ownerSections);
    if (
      row.role === 'Extra' &&
      Math.max(required.get(ownerKey(row)) ?? -1, required.get(`parent:${row.rowId}`) ?? -1) >=
        row.order
    )
      throw new Error('Required bundle choices must precede extras');
  }
}
function validatePicker(row: BundleManifestRow, pickers: Map<string, string>): void {
  if (!globalBundlePicker(row)) return;
  const owner = `${row.kind}:${row.rowId}`;
  const screen = bundleScreenKey(row);
  if (pickers.has(owner) && pickers.get(owner) !== screen) throw new Error('Split bundle picker');
  pickers.set(owner, screen);
}
function recordScreen(
  row: BundleManifestRow,
  orders: Map<number, string>,
  labels: Map<string, string | null>,
): void {
  const key = bundleScreenKey(row);
  if (
    (orders.has(row.order) && orders.get(row.order) !== key) ||
    (labels.has(key) && labels.get(key) !== (row.label ?? null))
  )
    throw new Error('Conflicting bundle screens');
  orders.set(row.order, key);
  labels.set(key, row.label ?? null);
}
function validateDependency(
  row: BundleManifestRow,
  sections: ReadonlyMap<string, BundleManifestRow>,
  owners: ReadonlyMap<string, string>,
): void {
  if (!row.parentComponentId) return;
  const owner = owners.get(row.parentComponentId);
  const parent = owner ? sections.get(owner) : undefined;
  if (parent?.role !== 'Dish' || parent.order >= row.order)
    throw new Error('Invalid bundle dependency');
}
function ownerKey(row: BundleManifestRow): string {
  return `${row.sectionId}:${row.rowId}`;
}
function requiredOrders(rows: readonly BundleManifestRow[]): Map<string, number> {
  const orders = new Map<string, number>();
  for (const row of rows) {
    if (row.role !== 'RequiredChoice') continue;
    const keys = [ownerKey(row)];
    if (row.kind === 'BundleSection' && row.parentComponentId)
      keys.push(`parent:${row.parentComponentId}`);
    for (const key of keys) orders.set(key, Math.max(orders.get(key) ?? -1, row.order));
  }
  return orders;
}
