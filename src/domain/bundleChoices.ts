import type { ProductDetail } from '../api/productDetail';
import {
  catalogueGroup,
  distinctGroups,
  inDisplayOrder,
  type CatalogueChoiceGroup,
} from './catalogueChoices';

type Definition = NonNullable<ProductDetail['menuDefinition']>;
export function bundleChoices(
  definition: Definition | null,
  locale: string,
): CatalogueChoiceGroup[] {
  if (!definition) return [];
  if (definition.authoringVersion !== 1) throw new Error('Unsupported bundle version');
  return distinctGroups(
    inDisplayOrder(definition.sections ?? []).map((section) =>
      catalogueGroup(
        {
          id: section.id,
          kind: 'bundle',
          label: section.translations?.[locale]?.name || section.displayName || section.name || '',
          min: section.isRequired ? section.minSelection : 0,
          max: section.maxSelection,
          repeat: section.allowRepeatedItems,
          cardinality: section.allowRepeatedItems ? 'units' : 'choices',
        },
        inDisplayOrder(section.items ?? []).map((item) => ({
          isDefault: item.isDefault,
          option: {
            id: item.id,
            targetId: item.productId,
            kind: 'bundle',
            displayOrder: item.displayOrder,
            fixedVariationId: item.productVariationId,
            label: [item.productName, item.productVariationName].filter(Boolean).join(' · '),
            maxQuantity: section.allowRepeatedItems ? section.maxSelection : 1,
            available:
              item.availability.canOrder &&
              (!item.productVariationId ||
                (item.variations ?? []).some(
                  (variation) => variation.id === item.productVariationId && variation.isActive,
                )),
          },
        })),
      ),
    ),
  );
}
