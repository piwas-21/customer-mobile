import { z } from 'zod';
import { quantityIsValid } from '../domain/customization';
const quantity = z.number().int().refine(quantityIsValid);
const variation = z.uuid().nullable().optional();
const instructions = z.string().max(500).nullable().optional();
const groups = z
  .array(
    z
      .object({
        groupId: z.uuid(),
        options: z.array(
          z
            .object({
              kind: z.enum(['Ingredient', 'Product']),
              optionId: z.uuid(),
              quantity: z.int32().positive(),
            })
            .strict(),
        ),
      })
      .strict(),
  )
  .nullable()
  .optional();
const recipe = {
  selectedIngredients: z.array(z.uuid()).nullable().optional(),
  ingredientQuantities: z.record(z.uuid(), z.int32().nonnegative()).nullable().optional(),
  customizationSelections: groups,
};
const sides = z
  .array(
    z
      .object({
        id: z.uuid(),
        suggestedSideItemId: z.uuid(),
        quantity,
        productVariationId: variation,
      })
      .strict(),
  )
  .nullable()
  .optional();
const menuOptions = z
  .array(
    z
      .object({
        sectionId: z.uuid(),
        menuSectionItemId: z.uuid(),
        itemId: z.uuid(),
        productVariationId: variation,
        componentProductVariationId: variation,
        quantity,
        specialInstructions: instructions,
        ...recipe,
        selectedSideItems: sides,
      })
      .strict(),
  )
  .nullable()
  .optional();
// An ordering projection still has to validate ownership, availability and authoring semantics.
// These are supported wire fields, not client prices, totals or server presentation metadata.
export const basketAddInputSchema = z
  .object({
    productId: z.uuid(),
    productVariationId: variation,
    quantity,
    specialInstructions: instructions,
    ...recipe,
    selectedSideItems: sides,
    selectedMenuOptions: menuOptions,
  })
  .strict();
export type BasketAddInput = z.infer<typeof basketAddInputSchema>;
