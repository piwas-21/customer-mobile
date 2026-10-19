import type { ProductDetail } from '../api/productDetail';
import { completeManifestRows } from './manifestCompletion';
import { productStepRoles } from './productManifest';
import { validateBundleScreens } from './bundleManifestScreens';
import {
  bundleRowKey,
  bundleScreenKey,
  componentStepKinds,
  defaultBundleRows,
  globalBundlePicker,
  type BundleManifestRow,
} from './bundleManifestRows';
import type { ProductStepKind } from './productManifestRows';
type ManifestStep = NonNullable<
  NonNullable<ProductDetail['customerStepManifest']>['steps']
>[number];
export function bundleDecisions(product: ProductDetail): BundleManifestRow[][] {
  const defaults = defaultBundleRows(product);
  const expected = new Map(defaults.map((row) => [bundleRowKey(row), row]));
  if (expected.size !== defaults.length) throw new Error('Duplicate bundle reference');
  const manifest = product.customerStepManifest;
  if (
    manifest &&
    (manifest.schemaVersion !== 1 ||
      !Number.isSafeInteger(manifest.revision) ||
      manifest.revision < 0 ||
      !manifest.steps)
  )
    throw new Error('Unsupported bundle manifest');
  const seen = new Set<string>();
  const rows = (manifest?.steps ?? []).map((step) => {
    const section = step.kind === 'BundleSection';
    const candidate: BundleManifestRow = {
      kind: step.kind,
      sectionId: (section ? step.targetId : step.sectionId) ?? '',
      rowId: section ? null : (step.sectionItemId ?? null),
      productId: step.productId ?? null,
      scopeId: step.scopeId ?? null,
      role: step.compositionRole ?? '',
      order: step.presentationOrder,
      label: step.presentationLabel ?? null,
      parentComponentId: step.parentComponentId ?? null,
    };
    const key = bundleRowKey(candidate);
    const fallback = expected.get(key);
    const row = { ...candidate, role: step.compositionRole ?? fallback?.role ?? '' };
    if (!fallback || seen.has(key) || !validReference(step, row, fallback))
      throw new Error('Unsupported or stale bundle reference');
    seen.add(key);
    return row;
  });
  completeManifestRows(
    rows,
    defaults,
    bundleRowKey,
    bundleScreenKey,
    (row, first) =>
      row.kind === first.kind &&
      row.sectionId === first.sectionId &&
      row.rowId === first.rowId &&
      (globalBundlePicker(first) || row.role === first.role),
  );
  validateBundleScreens(rows, product);
  const screens = new Map<string, BundleManifestRow[]>();
  for (const row of [...rows].sort(
    (a, b) => a.order - b.order || bundleRowKey(a).localeCompare(bundleRowKey(b)),
  )) {
    const key = bundleScreenKey(row);
    const refs = screens.get(key) ?? [];
    refs.push(row);
    screens.set(key, refs);
  }
  return [...screens.values()];
}
function validReference(
  step: ManifestStep,
  row: BundleManifestRow,
  fallback: BundleManifestRow,
): boolean {
  if (
    !Number.isSafeInteger(row.order) ||
    row.order < 0 ||
    (step.presentationLabel != null && (row.role !== 'Dish' || step.presentationLabel.length > 120))
  )
    return false;
  if (row.kind === 'BundleSection')
    return (
      !step.sectionId &&
      !step.sectionItemId &&
      !step.productId &&
      !step.scopeId &&
      ['Menu', 'Dish', 'RequiredChoice', 'Extra', 'Side', 'Drink'].includes(row.role)
    );
  const productKind = (Object.keys(componentStepKinds) as ProductStepKind[]).find(
    (kind) => componentStepKinds[kind] === row.kind,
  );
  return (
    !step.targetId &&
    !step.parentComponentId &&
    row.productId === fallback.productId &&
    productKind !== undefined &&
    productStepRoles[productKind].includes(row.role)
  );
}
