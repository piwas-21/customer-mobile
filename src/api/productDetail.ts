import { orderTypeSchema, type OrderType } from './orderType';
import { z } from 'zod';
import { productSchema } from './catalogue';
import { bundleDefinitionSchema } from './bundleDetail';
import {
  availabilitySchema,
  customizationGroupSchema,
  productIngredientSchema,
  sauceRules,
  variationSchema,
} from './catalogueParts';
import { ApiFailure, type CustomerTransport } from '../core/transport';
import type { TenantContext } from '../core/tenantContext';

// Keep unknown enum values and manifest versions intact. A later ordering projection must
// refuse unsupported rules rather than silently dropping a required customer decision.
const manifestSchema = z.object({
  schemaVersion: z.number().int().positive(),
  revision: z.number().int().nonnegative(),
  steps: z
    .array(
      z.object({
        kind: z.string().min(1),
        targetId: z.uuid().nullish(),
        sectionId: z.uuid().nullish(),
        sectionItemId: z.uuid().nullish(),
        productId: z.uuid().nullish(),
        scopeId: z.uuid().nullish(),
        parentComponentId: z.uuid().nullish(),
        compositionRole: z.string().nullish(),
        presentationLabel: z.string().nullish(),
        presentationOrder: z.number().int(),
      }),
    )
    .nullable(),
});
export const productDetailSchema = productSchema.extend({
  type: z.string().min(1),
  hideBaseProduct: z.boolean(),
  isComponent: z.boolean(),
  availability: availabilitySchema,
  variations: z.array(variationSchema).nullable(),
  detailedIngredients: z.array(productIngredientSchema).nullable(),
  customizationGroups: z.array(customizationGroupSchema).nullable(),
  suggestedSideItems: z
    .array(
      z.object({
        id: z.uuid(),
        suggestedSideItemId: z.uuid(),
        name: z.string().nullable(),
        description: z.string().nullish(),
        price: z.number().nonnegative(),
        type: z.string().min(1),
        imageUrl: z.string().nullish(),
        isRequired: z.boolean(),
        displayOrder: z.number().int(),
      }),
    )
    .nullable(),
  menuDefinition: bundleDefinitionSchema.nullable(),
  customerStepManifest: manifestSchema.nullable(),
  ...sauceRules,
});
export type ProductDetail = z.infer<typeof productDetailSchema>;
export { orderTypeSchema, type OrderType } from './orderType';
export async function readProduct(
  client: CustomerTransport,
  context: TenantContext,
  productId: string,
  locale: string,
  orderType?: OrderType,
): Promise<ProductDetail> {
  const id = z.uuid().parse(productId);
  const channel =
    orderType === undefined ? '' : `?requestedOrderType=${orderTypeSchema.parse(orderType)}`;
  const product = await client.request(
    context,
    `/api/Products/${id}${channel}`,
    productDetailSchema,
    {
      locale,
    },
  );
  if (product.id !== id) throw new ApiFailure(200, 'contract');
  return product;
}
