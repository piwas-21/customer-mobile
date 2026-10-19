import { projectBundleComposition, type BundleSelections } from './bundleComposition';
import { bundleScreenKey, componentStepKinds, type BundleManifestRow } from './bundleManifestRows';
import { selectedBundleRows, sectionActive, type BundleFlowPlan } from './bundleFlowPlan';
import { itemFlowStep, itemStepComplete, type ItemFlowStep } from './itemFlow';
import type { ProductStepKind } from './productManifestRows';
import type { CatalogueChoiceGroup } from './catalogueChoices';
import { quantityIsValid, validateSelection } from './customization';
import type { ProductDetail } from '../api/productDetail';
export type BundleFlowStep =
  | Readonly<{ id: string; kind: 'quantity' }>
  | Readonly<{ id: string; kind: 'review' }>
  | Readonly<{ id: string; kind: 'section'; group: CatalogueChoiceGroup; active: boolean }>
  | Readonly<{
      id: string;
      kind: 'component';
      rowId: string;
      label: string;
      step: ItemFlowStep;
      groups: readonly CatalogueChoiceGroup[];
    }>;
export function bundleFlowSteps(
  plan: BundleFlowPlan,
  selection: BundleSelections,
): BundleFlowStep[] {
  const selected = selectedBundleRows(selection);
  const choices = new Map(
    plan.groups.flatMap(({ options }) => options.map((row) => [row.id, row] as const)),
  );
  const steps = plan.decisions.flatMap((refs) => {
    const step = decisionStep(refs, plan, selection, selected, choices);
    return step ? [step] : [];
  });
  return [{ id: 'quantity', kind: 'quantity' }, ...steps, { id: 'review', kind: 'review' }];
}
function decisionStep(
  refs: readonly BundleManifestRow[],
  plan: BundleFlowPlan,
  selection: BundleSelections,
  selected: ReadonlySet<string>,
  choices: ReadonlyMap<string, CatalogueChoiceGroup['options'][number]>,
): BundleFlowStep | undefined {
  const first = refs[0]!;
  const id = bundleScreenKey(first);
  if (first.kind === 'BundleSection') return sectionStep(first, plan, selection);
  if (!first.rowId || !selected.has(first.rowId)) return undefined;
  const component = plan.component(first.rowId);
  const kind = (Object.keys(componentStepKinds) as ProductStepKind[]).find(
    (kind) => componentStepKinds[kind] === first.kind,
  );
  if (!kind) throw new Error('Unknown component decision');
  const row = choices.get(first.rowId);
  if (!row) throw new Error('Unknown component choice');
  return {
    id,
    kind: 'component',
    rowId: first.rowId,
    label: row.label,
    groups: component.groups,
    step: itemFlowStep(
      {
        id,
        kind,
        targetIds: refs.map(({ scopeId }) => scopeId!),
        label: first.label ?? null,
        role: first.role,
      },
      component,
    ),
  };
}
function sectionStep(
  row: BundleManifestRow,
  plan: BundleFlowPlan,
  selection: BundleSelections,
): BundleFlowStep | undefined {
  const group = plan.groups.find(({ id }) => id === row.sectionId);
  if (!group) throw new Error('Unknown bundle section');
  const active = sectionActive(row, selection);
  return active || group.min > 0
    ? { id: bundleScreenKey(row), kind: 'section', group, active }
    : undefined;
}
export function bundleStepComplete(step: BundleFlowStep, selection: BundleSelections): boolean {
  if (step.kind === 'quantity') return quantityIsValid(selection.quantity);
  if (step.kind === 'review') return false;
  if (step.kind === 'section')
    return (
      step.active &&
      validateSelection(step.group, selection.sections[step.group.id] ?? {}) === 'valid'
    );
  const component = selection.components[step.rowId];
  return Boolean(component && itemStepComplete(step.step, component));
}
export function bundleFlowComplete(
  product: ProductDetail,
  details: ReadonlyMap<string, ProductDetail>,
  selection: BundleSelections,
): boolean {
  try {
    projectBundleComposition(product, details, selection);
    return true;
  } catch {
    return false;
  }
}
