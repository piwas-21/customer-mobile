import { z } from 'zod';

export const translatedContentSchema = z.record(
  z.string(),
  z.object({ name: z.string().nullish(), description: z.string().nullish() }),
);
export const availabilitySchema = z.object({
  canOrder: z.boolean(),
  reason: z.string().optional(),
  allowedOrderTypes: z.array(z.string()).nullable().optional(),
  inheritsOrderTypes: z.boolean().optional(),
});
export const sauceRules = {
  sauceMin: z.number().int().nonnegative(),
  sauceMax: z.number().int().nonnegative().nullable(),
  sauceIncludedFree: z.number().int().nonnegative(),
};
export const variationSchema = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  description: z.string().nullish(),
  priceModifier: z.number(),
  finalPrice: z.number().nonnegative(),
  isActive: z.boolean(),
  displayOrder: z.number().int(),
  globalVariationId: z.uuid().nullish(),
  content: translatedContentSchema.nullable(),
});
export const ingredientSchema = z.object({
  id: z.uuid().nullable(),
  name: z.string().nullable(),
  isOptional: z.boolean(),
  price: z.number().nonnegative(),
  isIncludedInBasePrice: z.boolean(),
  isActive: z.boolean(),
  displayOrder: z.number().int(),
  maxQuantity: z.number().int().nonnegative(),
  kind: z.string().min(1),
  exclusionGroup: z.string().nullish(),
  content: translatedContentSchema.nullable(),
});
export const productIngredientSchema = ingredientSchema.extend({
  globalIngredientId: z.uuid().nullish(),
  isNoneOption: z.boolean(),
});
export const customizationGroupSchema = z.object({
  id: z.uuid().nullable(),
  authoringVersion: z.number().int().nonnegative(),
  name: z.string().nullable(),
  description: z.string().nullish(),
  displayOrder: z.number().int(),
  isRequired: z.boolean(),
  minSelection: z.number().int().nonnegative(),
  maxSelection: z.number().int().nonnegative(),
  includedFreeUnits: z.number().int().nonnegative(),
  isActive: z.boolean(),
  content: translatedContentSchema.nullable(),
  ingredientOptions: z
    .array(
      z.object({
        id: z.uuid().nullable(),
        productIngredientId: z.uuid(),
        displayOrder: z.number().int(),
        isDefault: z.boolean(),
      }),
    )
    .nullable(),
  productOptions: z
    .array(
      z.object({
        id: z.uuid().nullable(),
        optionProductId: z.uuid(),
        optionProductName: z.string().nullable(),
        optionProductIsActive: z.boolean(),
        optionProductIsAvailable: z.boolean(),
        availability: availabilitySchema,
        additionalPrice: z.number(),
        displayOrder: z.number().int(),
        isDefault: z.boolean(),
      }),
    )
    .nullable(),
});
