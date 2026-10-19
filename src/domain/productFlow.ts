import type { ProductDetail } from '../api/productDetail';
import type { CatalogueChoiceGroup } from './catalogueChoices';
import { validateSelection, quantityIsValid } from './customization';
import {
  productComposition,
  defaultGroupSelections,
  projectProductComposition,
  type ProductSelections,
  type CompositionLabels,
} from './productComposition';
import type { ProductDecision } from './productManifest';
import { defaultSides, type SideChoice } from './sideChoices';
import type { VariationChoices } from './variationChoices';
export type FlowChoice = Readonly<{ sourceId: string; group: CatalogueChoiceGroup }>;
export type ProductFlowStep =
  | Readonly<{ id: string; kind: 'quantity' | 'review' }>
  | Readonly<{ id: string; kind: 'variation'; label: string | null; choices: VariationChoices }>
  | Readonly<{ id: string; kind: 'groups'; choices: readonly FlowChoice[] }>
  | Readonly<{ id: string; kind: 'sides'; choices: readonly SideChoice[] }>;
export function productFlow(
  product: ProductDetail,
  details: ReadonlyMap<string, ProductDetail>,
  locale: string,
  labels: CompositionLabels,
) {
  const plan = productComposition(product, details, locale, labels);
  const steps: ProductFlowStep[] = [{ id: 'quantity', kind: 'quantity' }];
  for (const decision of plan.decisions) {
    switch (decision.kind) {
      case 'ProductVariation':
        steps.push({
          id: decision.id,
          kind: 'variation',
          label: decision.label,
          choices: plan.variations,
        });
        break;
      case 'ProductSuggestedSide':
        steps.push({
          id: decision.id,
          kind: 'sides',
          choices: plan.sides.filter((side) => decision.targetIds.includes(side.membershipId)),
        });
        break;
      default:
        steps.push({
          id: decision.id,
          kind: 'groups',
          choices: decisionGroups(decision, plan.groups),
        });
    }
  }
  steps.push({ id: 'review', kind: 'review' });
  const defaults: ProductSelections = {
    quantity: 1,
    variationId: plan.variations.defaultId,
    instructions: '',
    groups: defaultGroupSelections(plan.groups),
    sides: defaultSides(plan.sides),
  };
  return { steps, defaults, groups: plan.groups };
}
function decisionGroups(
  decision: ProductDecision,
  groups: readonly CatalogueChoiceGroup[],
): FlowChoice[] {
  const targets = new Set(decision.targetIds);
  if (decision.kind === 'ProductCustomizationGroup')
    return groups
      .filter((group) => targets.has(group.id))
      .map((group) => ({ sourceId: group.id, group }));
  const kind = decision.kind === 'ProductSauce' ? 'sauce' : 'recipe';
  return groups
    .filter((group) => group.kind === kind)
    .map((group) => {
      const options = group.options.filter((option) => targets.has(option.targetId));
      return {
        sourceId: group.id,
        group: { ...group, options, max: Math.min(group.max, options.length) },
      };
    });
}
export function flowStepComplete(step: ProductFlowStep, selection: ProductSelections): boolean {
  switch (step.kind) {
    case 'quantity':
      return quantityIsValid(selection.quantity);
    case 'review':
      return false;
    case 'variation':
      return step.choices.options.some(({ id }) => id === selection.variationId);
    case 'groups':
      return step.choices.every(
        ({ sourceId, group }) =>
          validateSelection(group, selectionForChoices(group, selection.groups[sourceId] ?? {})) ===
          'valid',
      );
    case 'sides':
      return step.choices.every((choice) => {
        const value = selection.sides[choice.membershipId];
        if (!value) return !choice.required;
        return (
          choice.available &&
          quantityIsValid(value.quantity) &&
          Boolean(choice.variations?.options.some(({ id }) => id === value.variationId))
        );
      });
  }
}
export function selectionForChoices(
  group: CatalogueChoiceGroup,
  selection: Readonly<Record<string, number>>,
) {
  return Object.fromEntries(group.options.map(({ id }) => [id, selection[id] ?? 0]));
}
export function productFlowComplete(
  product: ProductDetail,
  details: ReadonlyMap<string, ProductDetail>,
  selection: ProductSelections,
): boolean {
  try {
    projectProductComposition(product, details, selection);
    return true;
  } catch {
    return false;
  }
}
