import type { ProductDetail } from '../api/productDetail';
import { customerName } from '../api/catalogue';
import {
  catalogueGroup,
  distinctGroups,
  inDisplayOrder,
  stableChoiceId,
  type CatalogueChoiceGroup,
  type DefaultChoice,
} from './catalogueChoices';

type Ingredient = Omit<NonNullable<ProductDetail['detailedIngredients']>[number], 'isNoneOption'>;
type Group = NonNullable<ProductDetail['customizationGroups']>[number];
export function explicitChoices(
  groups: readonly Group[] | null,
  ingredients: readonly Ingredient[] | null,
  locale: string,
): CatalogueChoiceGroup[] {
  const recipe = new Map((ingredients ?? []).map((ingredient) => [ingredient.id, ingredient]));
  return distinctGroups(
    inDisplayOrder((groups ?? []).filter(({ isActive }) => isActive)).map((group) => {
      if (group.authoringVersion !== 1) throw new Error('Unsupported customization version');
      const choices: DefaultChoice[] = inDisplayOrder(group.ingredientOptions ?? []).map(
        (membership) => {
          const ingredient = recipe.get(membership.productIngredientId);
          if (!ingredient || !['ingredient', 'sauce'].includes(ingredient.kind))
            throw new Error('Unsupported customization ingredient');
          return {
            isDefault: membership.isDefault,
            option: {
              id: `ingredient:${stableChoiceId(membership.id)}`,
              targetId: membership.productIngredientId,
              membershipId: stableChoiceId(membership.id),
              kind: 'ingredient',
              displayOrder: membership.displayOrder,
              label: customerName(ingredient, locale),
              maxQuantity: ingredient.maxQuantity,
              available: ingredient.isActive && ingredient.maxQuantity > 0,
            },
          };
        },
      );
      choices.push(
        ...inDisplayOrder(group.productOptions ?? []).map((membership): DefaultChoice => ({
          isDefault: membership.isDefault,
          option: {
            id: `product:${stableChoiceId(membership.id)}`,
            targetId: membership.optionProductId,
            membershipId: stableChoiceId(membership.id),
            kind: 'product',
            displayOrder: membership.displayOrder,
            label: membership.optionProductName ?? '',
            maxQuantity: 1,
            available:
              membership.optionProductIsActive &&
              membership.optionProductIsAvailable &&
              membership.availability.canOrder,
          },
        })),
      );
      return catalogueGroup(
        {
          id: stableChoiceId(group.id),
          kind: 'explicit',
          label: customerName(group, locale),
          min: group.minSelection,
          max: group.maxSelection,
          repeat: true,
          cardinality: 'choices',
        },
        choices,
      );
    }),
  );
}
