import { basketAddInputSchema, type BasketAddInput } from '../api/basketRequest';
import type { ProductDetail } from '../api/productDetail';
import { bundleChoices } from './bundleChoices';
import { componentSource, type BundleComponent } from './bundleComponent';
import { bundleDecisions } from './bundleManifest';
import { projectBundleChoice } from './choiceProjection';
import type { Selection } from './customization';
import {
  projectItemSelections,
  selectionComposition,
  type CompositionLabels,
  type ItemSelections,
} from './selectionComposition';
export type BundleSelections = Readonly<{
  quantity: number;
  instructions: string;
  sections: Readonly<Record<string, Selection>>;
  components: Readonly<Record<string, ItemSelections>>;
}>;
export function bundleComposition(product: ProductDetail, locale: string) {
  if (
    !product.isActive ||
    !product.isAvailable ||
    !product.availability.canOrder ||
    product.isComponent ||
    product.type !== 'menu' ||
    !product.menuDefinition ||
    product.variations?.some(({ isActive }) => isActive) ||
    product.customizationGroups?.some(({ isActive }) => isActive) ||
    product.detailedIngredients?.some(({ isActive }) => isActive) ||
    product.suggestedSideItems?.length
  )
    throw new Error('Unsupported or unavailable bundle');
  return {
    groups: bundleChoices(product.menuDefinition, locale),
    decisions: bundleDecisions(product),
  };
}
export function componentComposition(
  item: BundleComponent,
  details: ReadonlyMap<string, ProductDetail>,
  locale: string,
  labels: CompositionLabels,
) {
  const plan = selectionComposition(componentSource(item), details, locale, labels);
  if (!item.productVariationId) return plan;
  const fixed = plan.variations.options.find(({ id }) => id === item.productVariationId);
  if (!fixed) throw new Error('Unavailable fixed component variation');
  return { ...plan, variations: { options: [fixed], defaultId: fixed.id } };
}
export function projectBundleComposition(
  product: ProductDetail,
  details: ReadonlyMap<string, ProductDetail>,
  selection: BundleSelections,
): BasketAddInput {
  const { groups, decisions } = bundleComposition(product, '');
  const sectionIds = new Set(groups.map(({ id }) => id));
  if (Object.keys(selection.sections).some((id) => !sectionIds.has(id)))
    throw new Error('Unknown bundle section');
  const rows = new Map(
    (product.menuDefinition?.sections ?? []).flatMap((section) =>
      (section.items ?? []).map((item) => [item.id, item] as const),
    ),
  );
  const selected = new Set(
    Object.values(selection.sections).flatMap((values) =>
      Object.entries(values)
        .filter(([, quantity]) => quantity > 0)
        .map(([id]) => id),
    ),
  );
  if (Object.keys(selection.components).some((id) => !selected.has(id)))
    throw new Error('Unselected bundle component state');
  const sectionSteps = new Map(
    decisions
      .flat()
      .filter((row) => row.kind === 'BundleSection')
      .map((row) => [row.sectionId, row]),
  );
  const selectedMenuOptions = groups.flatMap((group) => {
    const values = selection.sections[group.id] ?? {};
    const parent = sectionSteps.get(group.id)?.parentComponentId;
    if (parent && !selected.has(parent)) {
      if (group.min > 0) throw new Error('Required dependent bundle section unavailable');
      if (Object.values(values).some((quantity) => quantity !== 0))
        throw new Error('Inactive dependent bundle section');
      return [];
    }
    return projectBundleChoice(group, values).map((option) => {
      const item = rows.get(option.menuSectionItemId!);
      if (!item) throw new Error('Unknown bundle component');
      return { ...option, ...projectComponent(item, details, selection.components[item.id]) };
    });
  });
  return basketAddInputSchema.parse({
    productId: product.id,
    quantity: selection.quantity,
    specialInstructions: selection.instructions.trim(),
    selectedMenuOptions,
  });
}
function projectComponent(
  item: BundleComponent,
  details: ReadonlyMap<string, ProductDetail>,
  selection?: ItemSelections,
) {
  const source = componentSource(item);
  const plan = componentComposition(item, details, '', { base: '', ingredients: '', sauces: '' });
  const current = selection ?? {
    variationId: plan.variations.defaultId,
    instructions: '',
    groups: {},
    sides: {},
  };
  if (!plan.variations.options.some(({ id }) => id === current.variationId))
    throw new Error('Unavailable component variation');
  const { productVariationId, ...customization } = projectItemSelections(source, details, current);
  return { ...customization, componentProductVariationId: productVariationId };
}
