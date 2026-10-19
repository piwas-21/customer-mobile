import type { ProductDetail } from '../api/productDetail';
import type { components } from '../api/generated';
import { quantityIsValid } from './customization';
import { projectVariation, variationChoices, type VariationChoices } from './variationChoices';

export type SideChoice = Readonly<{
  membershipId: string;
  productId: string;
  label: string;
  required: boolean;
  available: boolean;
  variations: VariationChoices | null;
}>;
export type SideSelection = Readonly<{ quantity: number; variationId: string | null }>;
type SideDetails = ReadonlyMap<string, ProductDetail>;

export function sideChoices(
  product: Pick<ProductDetail, 'suggestedSideItems'>,
  details: SideDetails,
  locale: string,
  baseLabel: string,
): SideChoice[] {
  const sides = product.suggestedSideItems ?? [];
  if (new Set(sides.map(({ suggestedSideItemId }) => suggestedSideItemId)).size !== sides.length)
    throw new Error('Unsupported side identities');
  return [...sides]
    .sort(
      (first, second) =>
        first.displayOrder - second.displayOrder ||
        first.suggestedSideItemId.localeCompare(second.suggestedSideItemId),
    )
    .map((side) => {
      const detail = details.get(side.id);
      if (detail && detail.id !== side.id) throw new Error('Wrong side product');
      const available = Boolean(
        detail &&
        detail.isActive &&
        detail.isAvailable &&
        detail.availability.canOrder &&
        detail.sauceMin === 0 &&
        !detail.customizationGroups?.some(
          (group) => group.isActive && (group.authoringVersion !== 1 || group.minSelection > 0),
        ) &&
        !detail.isComponent &&
        !detail.menuDefinition &&
        ['mainItem', 'beverage', 'dessert', 'sauce', 'addOn'].includes(detail.type),
      );
      return {
        membershipId: side.suggestedSideItemId,
        productId: side.id,
        label: side.name ?? '',
        required: side.isRequired,
        available,
        variations: available && detail ? variationChoices(detail, locale, baseLabel) : null,
      };
    });
}

export function defaultSides(choices: readonly SideChoice[]): Record<string, SideSelection> {
  const defaults: Record<string, SideSelection> = {};
  for (const choice of choices) {
    if (!choice.required) continue;
    if (!choice.available || !choice.variations) throw new Error('Required side unavailable');
    defaults[choice.membershipId] = { quantity: 1, variationId: choice.variations.defaultId };
  }
  return defaults;
}

export function projectSides(
  product: Pick<ProductDetail, 'suggestedSideItems'>,
  details: SideDetails,
  selections: Readonly<Record<string, SideSelection>>,
): Pick<components['schemas']['AddToBasketDto'], 'selectedSideItems'> {
  const choices = sideChoices(product, details, '', '');
  if (Object.keys(selections).some((id) => !choices.some((choice) => choice.membershipId === id)))
    throw new Error('Unknown side membership');
  const selectedSideItems: NonNullable<
    components['schemas']['AddToBasketDto']['selectedSideItems']
  > = [];
  for (const choice of choices) {
    const selection = selections[choice.membershipId];
    if (!selection) {
      if (choice.required) throw new Error('Required side missing');
      continue;
    }
    if (!choice.available || !quantityIsValid(selection.quantity))
      throw new Error('Invalid side selection');
    const detail = details.get(choice.productId);
    if (!detail) throw new Error('Side detail unavailable');
    selectedSideItems.push({
      id: choice.productId,
      suggestedSideItemId: choice.membershipId,
      quantity: selection.quantity,
      ...projectVariation(detail, selection.variationId),
    });
  }
  return { selectedSideItems };
}
