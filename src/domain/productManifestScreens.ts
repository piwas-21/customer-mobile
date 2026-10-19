import {
  isGlobalProductPicker,
  productScreenKey,
  type ProductManifestRow,
  type ProductStepKind,
} from './productManifestRows';

export function validateProductScreens(rows: readonly ProductManifestRow[]): void {
  const byOrder = new Map<number, string>();
  const pickers = new Map<ProductStepKind, string>();
  const labels = new Map<string, string | null>();
  const lastRequired = rows.reduce(
    (max, row) => (row.role === 'RequiredChoice' ? Math.max(max, row.order) : max),
    -1,
  );
  for (const row of rows) {
    const key = productScreenKey(row);
    if (byOrder.has(row.order) && byOrder.get(row.order) !== key)
      throw new Error('Conflicting customer screens');
    byOrder.set(row.order, key);
    recordGlobalPicker(row, pickers);
    if (row.role === 'Extra' && lastRequired >= row.order)
      throw new Error('Required choices must precede extras');
    if (labels.has(key) && labels.get(key) !== (row.label ?? null))
      throw new Error('Conflicting customer screen labels');
    labels.set(key, row.label ?? null);
  }
}

function recordGlobalPicker(row: ProductManifestRow, pickers: Map<ProductStepKind, string>): void {
  if (!isGlobalProductPicker(row.kind)) return;
  const key = productScreenKey(row);
  if (pickers.has(row.kind) && pickers.get(row.kind) !== key)
    throw new Error('Split global picker');
  pickers.set(row.kind, key);
}
