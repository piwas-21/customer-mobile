import { z } from 'zod';
import {
  availabilitySchema,
  customizationGroupSchema,
  ingredientSchema,
  sauceRules,
  variationSchema,
  translatedContentSchema,
} from './catalogueParts';

export const bundleSectionItemSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  productVariationId: z.uuid().nullable(),
  productVariationName: z.string().nullable(),
  productVariationPriceModifier: z.number().nullable(),
  productName: z.string().nullable(),
  additionalPrice: z.number(),
  displayOrder: z.number().int(),
  isDefault: z.boolean(),
  ingredients: z.array(z.string()).nullable(),
  allergens: z.array(z.string()).nullable(),
  availability: availabilitySchema,
  detailedIngredients: z.array(ingredientSchema).nullable(),
  variations: z.array(variationSchema).nullable(),
  suggestedSideItems: z
    .array(
      z.object({
        id: z.uuid(),
        sideItemProductId: z.uuid(),
        sideItemProductName: z.string().nullable(),
        sideItemBasePrice: z.number().nonnegative(),
        sideItemProductType: z.string().min(1),
        availability: availabilitySchema,
        variations: z.array(variationSchema).nullable(),
        isRequired: z.boolean(),
        displayOrder: z.number().int(),
      }),
    )
    .nullable(),
  customizationGroups: z.array(customizationGroupSchema).nullable(),
  hideBaseProduct: z.boolean(),
  ...sauceRules,
});
export const bundleDefinitionSchema = z.object({
  id: z.uuid(),
  authoringVersion: z.number().int().nonnegative(),
  parentOfferProductId: z.uuid().nullable(),
  parentOfferVariationId: z.uuid().nullable(),
  isAlwaysAvailable: z.boolean(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  availableMonday: z.boolean(),
  availableTuesday: z.boolean(),
  availableWednesday: z.boolean(),
  availableThursday: z.boolean(),
  availableFriday: z.boolean(),
  availableSaturday: z.boolean(),
  availableSunday: z.boolean(),
  sections: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string().nullable(),
        description: z.string().nullish(),
        displayName: z.string().nullable(),
        displayDescription: z.string().nullable(),
        translations: translatedContentSchema.nullable(),
        displayOrder: z.number().int(),
        isRequired: z.boolean(),
        minSelection: z.number().int().nonnegative(),
        maxSelection: z.number().int().nonnegative(),
        allowRepeatedItems: z.boolean(),
        items: z.array(bundleSectionItemSchema).nullable(),
      }),
    )
    .nullable(),
});
