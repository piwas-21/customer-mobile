import type { CatalogueChoiceGroup } from './catalogueChoices';
import { validateSelection, quantityIsValid } from './customization';
import type { ProductDecision } from './productManifest';
import type { ItemSelections, selectionComposition } from './selectionComposition';
import type { SideChoice } from './sideChoices';
import type { VariationChoices } from './variationChoices';
export type FlowChoice = Readonly<{ sourceId: string; group: CatalogueChoiceGroup }>;
export type ItemFlowStep =
  | Readonly<{ id: string; kind: 'variation'; label: string | null; choices: VariationChoices }>
  | Readonly<{ id: string; kind: 'groups'; choices: readonly FlowChoice[] }>
  | Readonly<{ id: string; kind: 'sides'; choices: readonly SideChoice[] }>;
export function itemFlowStep(
  decision: ProductDecision,
  plan: ReturnType<typeof selectionComposition>,
): ItemFlowStep {
  switch (decision.kind) {
    case 'ProductVariation':
      return {
        id: decision.id,
        kind: 'variation',
        label: decision.label,
        choices: plan.variations,
      };
    case 'ProductSuggestedSide':
      return {
        id: decision.id,
        kind: 'sides',
        choices: plan.sides.filter((side) => decision.targetIds.includes(side.membershipId)),
      };
    default:
      return { id: decision.id, kind: 'groups', choices: decisionGroups(decision, plan.groups) };
  }
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
export function itemStepComplete(step: ItemFlowStep, selection: ItemSelections): boolean {
  switch (step.kind) {
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
