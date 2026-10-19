import type { ProductDetail } from '../api/productDetail';
import { validateProductScreens } from './productManifestScreens';
import {
  defaultProductRows,
  isGlobalProductPicker,
  productRowKey,
  productScreenKey,
  type ProductManifestRow,
  type ProductStepKind,
} from './productManifestRows';

export type ProductDecision = Readonly<{
  id: string;
  kind: ProductStepKind;
  targetIds: readonly string[];
  label: string | null;
  role: string;
}>;
const roles: Readonly<Record<ProductStepKind, readonly string[]>> = {
  ProductVariation: ['Dish', 'RequiredChoice'],
  ProductIngredient: ['Ingredient', 'Extra'],
  ProductSauce: ['Sauce', 'Extra'],
  ProductCustomizationGroup: ['RequiredChoice', 'Extra'],
  ProductSuggestedSide: ['Side', 'Drink'],
};
export function productDecisions(product: ProductDetail): ProductDecision[] {
  const defaults = defaultProductRows(product);
  const manifest = product.customerStepManifest;
  if (
    manifest &&
    (manifest.schemaVersion !== 1 ||
      !Number.isSafeInteger(manifest.revision) ||
      manifest.revision < 0 ||
      !manifest.steps)
  )
    throw new Error('Unsupported customer-step manifest');
  const expected = new Map(defaults.map((row) => [productRowKey(row), row]));
  if (expected.size !== defaults.length) throw new Error('Duplicate customization reference');
  const seen = new Set<string>();
  const rows: ProductManifestRow[] = (manifest?.steps ?? []).map((step) => {
    const fallback = expected.get(`${step.kind}:${step.targetId}`);
    const role = step.compositionRole ?? fallback?.role;
    if (
      !fallback ||
      !role ||
      !roles[fallback.kind].includes(role) ||
      !Number.isSafeInteger(step.presentationOrder) ||
      step.presentationOrder < 0 ||
      (step.presentationLabel && (role !== 'Dish' || step.presentationLabel.length > 120)) ||
      [
        step.sectionId,
        step.sectionItemId,
        step.productId,
        step.scopeId,
        step.parentComponentId,
      ].some(Boolean)
    )
      throw new Error('Unsupported or stale customer-step reference');
    const key = productRowKey(fallback);
    if (seen.has(key)) throw new Error('Duplicate customization reference');
    seen.add(key);
    return {
      ...fallback,
      role,
      order: step.presentationOrder,
      label: step.presentationLabel ?? null,
    };
  });
  completeRows(rows, defaults, seen);
  validateProductScreens(rows);
  const screens = new Map<string, ProductManifestRow[]>();
  for (const row of [...rows].sort(
    (a, b) => a.order - b.order || productRowKey(a).localeCompare(productRowKey(b)),
  )) {
    const key = productScreenKey(row);
    const refs = screens.get(key) ?? [];
    refs.push(row);
    screens.set(key, refs);
  }
  return [...screens].map(([id, refs]) => {
    const first = refs[0]!;
    return {
      id,
      kind: first.kind,
      targetIds: refs.map(({ targetId }) => targetId),
      label: first.label ?? null,
      role: first.role,
    };
  });
}
function completeRows(
  rows: ProductManifestRow[],
  defaults: readonly ProductManifestRow[],
  seen: ReadonlySet<string>,
): void {
  const authored = [...rows];
  let nextOrder = rows.reduce((max, row) => Math.max(max, row.order), -1) + 1;
  const missingScreens = new Map<string, ProductManifestRow[]>();
  for (const row of defaults) {
    if (seen.has(productRowKey(row))) continue;
    const key = productScreenKey(row);
    const refs = missingScreens.get(key) ?? [];
    refs.push(row);
    missingScreens.set(key, refs);
  }
  for (const missing of missingScreens.values()) {
    const first = missing[0]!;
    const compatible = authored.filter(
      (row) =>
        row.kind === first.kind && (isGlobalProductPicker(first.kind) || row.role === first.role),
    );
    const screens = new Set(compatible.map(productScreenKey));
    const target = screens.size === 1 ? compatible[0] : undefined;
    const order = target?.order ?? nextOrder++;
    rows.push(
      ...missing.map((row) => ({
        ...row,
        order,
        role: target?.role ?? row.role,
        label: target?.label ?? null,
      })),
    );
  }
}
