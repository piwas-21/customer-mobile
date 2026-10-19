import type { ProductDetail } from '../api/productDetail';
import { quantityIsValid } from './customization';
import {
  productComposition,
  defaultGroupSelections,
  projectProductComposition,
  type ProductSelections,
  type CompositionLabels,
} from './productComposition';
import { defaultSides } from './sideChoices';
import { itemFlowStep, itemStepComplete, type ItemFlowStep } from './itemFlow';
export type { FlowChoice } from './itemFlow';
export { selectionForChoices } from './itemFlow';
export type ProductFlowStep =
  | Readonly<{ id: string; kind: 'quantity' }>
  | Readonly<{ id: string; kind: 'review' }>
  | ItemFlowStep;
export function productFlow(
  product: ProductDetail,
  details: ReadonlyMap<string, ProductDetail>,
  locale: string,
  labels: CompositionLabels,
) {
  const plan = productComposition(product, details, locale, labels);
  const steps: ProductFlowStep[] = [{ id: 'quantity', kind: 'quantity' }];
  for (const decision of plan.decisions) steps.push(itemFlowStep(decision, plan));
  steps.push({ id: 'review', kind: 'review' });
  const defaults: ProductSelections = {
    quantity: 1,
    variationId: plan.variations.defaultId,
    instructions: '',
    groups: defaultGroupSelections(plan.groups),
    sides: defaultSides(plan.sides),
  };
  return { steps, defaults, groups: plan.groups, variations: plan.variations, sides: plan.sides };
}
export function flowStepComplete(step: ProductFlowStep, selection: ProductSelections): boolean {
  if (step.kind === 'quantity') return quantityIsValid(selection.quantity);
  if (step.kind === 'review') return false;
  return itemStepComplete(step, selection);
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
