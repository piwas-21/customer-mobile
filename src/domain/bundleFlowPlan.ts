import type { ProductDetail } from '../api/productDetail';
import {
  bundleComposition,
  componentComposition,
  type BundleSelections,
} from './bundleComposition';
import type { BundleManifestRow } from './bundleManifestRows';
import { defaultGroupSelections } from './productComposition';
import type { CompositionLabels } from './selectionComposition';
import { defaultSides } from './sideChoices';
export function bundleFlowPlan(
  product: ProductDetail,
  details: ReadonlyMap<string, ProductDetail>,
  locale: string,
  labels: CompositionLabels,
) {
  const { groups, decisions } = bundleComposition(product, locale);
  const rows = new Map(
    (product.menuDefinition?.sections ?? []).flatMap((section) =>
      (section.items ?? []).map((item) => [item.id, item] as const),
    ),
  );
  return {
    product,
    groups,
    decisions,
    component(rowId: string) {
      const item = rows.get(rowId);
      if (!item) throw new Error('Unknown bundle component');
      return componentComposition(item, details, locale, labels);
    },
  };
}
export type BundleFlowPlan = ReturnType<typeof bundleFlowPlan>;
export function selectedBundleRows(selection: BundleSelections): Set<string> {
  return new Set(
    Object.values(selection.sections).flatMap((values) =>
      Object.entries(values)
        .filter(([, quantity]) => quantity > 0)
        .map(([id]) => id),
    ),
  );
}
export function sectionActive(row: BundleManifestRow, selection: BundleSelections): boolean {
  return !row.parentComponentId || selectedBundleRows(selection).has(row.parentComponentId);
}
export function reconcileBundleSelection(
  plan: BundleFlowPlan,
  selection: BundleSelections,
): BundleSelections {
  const sections = { ...selection.sections };
  for (const row of plan.decisions.flat())
    if (row.kind === 'BundleSection' && !sectionActive(row, { ...selection, sections }))
      sections[row.sectionId] = {};
  const selected = selectedBundleRows({ ...selection, sections });
  const components = Object.fromEntries(
    [...selected].map((rowId) => {
      const previous = selection.components[rowId];
      if (previous) return [rowId, previous];
      const component = plan.component(rowId);
      return [
        rowId,
        {
          variationId: component.variations.defaultId,
          instructions: '',
          groups: defaultGroupSelections(component.groups),
          sides: defaultSides(component.sides),
        },
      ];
    }),
  );
  return { ...selection, sections, components };
}
export function defaultBundleSelection(plan: BundleFlowPlan): BundleSelections {
  return reconcileBundleSelection(plan, {
    quantity: 1,
    instructions: '',
    sections: defaultGroupSelections(plan.groups),
    components: {},
  });
}
