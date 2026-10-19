import { z } from 'zod';
import { orderTypeSchema } from './orderType';
const money = z.number().nonnegative();
const names = z.array(z.string()).nullish();
const sideSchema = z.object({
  id: z.uuid(),
  suggestedSideItemId: z.uuid().nullish(),
  name: z.string(),
  variationName: z.string().nullish(),
  quantity: z.int32().positive(),
  price: money,
  subTotal: money,
});
const lineSchema = z.object({
  id: z.uuid().nullable(),
  productId: z.uuid().nullish(),
  menuId: z.uuid().nullish(),
  productName: z.string().nullish(),
  menuName: z.string().nullish(),
  productVariationId: z.uuid().nullish(),
  variationName: z.string().nullish(),
  quantity: z.int32().positive(),
  unitPrice: money,
  itemTotal: money,
  customizationPrice: z.number(),
  specialInstructions: z.string().nullish(),
  selectedIngredientNames: names,
  addedIngredientNames: names,
  removedIngredientNames: names,
  compositionRole: z.string().nullish(),
  presentationLabel: z.string().nullish(),
  presentationOrder: z.int32().nullish(),
  selectedSideItems: z.array(sideSchema).nullish(),
});
export type BasketLine = z.infer<typeof lineSchema> & {
  childItems?: BasketLine[] | null | undefined;
};
export const basketLineSchema: z.ZodType<BasketLine> = lineSchema.extend({
  childItems: z.lazy(() => z.array(basketLineSchema).nullish()),
});
export const basketResponseSchema = z.object({
  id: z.uuid(),
  userId: z.uuid().nullable(),
  sessionId: z.string().min(1).max(100),
  subTotal: money,
  tax: money,
  deliveryFee: money,
  discount: money,
  customerDiscount: money,
  customerDiscountName: z.string().nullish(),
  total: money,
  totalItems: z.int32().nonnegative(),
  orderType: orderTypeSchema.nullable(),
  purchaseFingerprint: z.string().regex(/^(?:[a-fA-F0-9]{64})?$/),
  items: z.array(basketLineSchema),
});
export type CustomerBasket = z.infer<typeof basketResponseSchema>;
