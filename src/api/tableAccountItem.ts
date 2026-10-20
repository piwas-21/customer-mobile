import { z } from 'zod';
import { canonicalUuidSchema } from '../core/identifiers';
import { checkoutAmount, checkoutMoney } from './checkoutMoney';
// The existing guest account projection descends at most twenty levels.
export const TABLE_ACCOUNT_DEPTH = 20;
export type TableAccountItem = {
  itemId: string;
  productName: string;
  variationName: string | null;
  quantity: number;
  unitPrice: number;
  itemTotal: number;
  ingredientCustomizations: { name: string; quantity: number; removed: boolean; addOn: boolean }[];
  sideItems: TableAccountItem[];
};
const ingredient = z.strictObject({
  name: z.string(),
  quantity: z.int32().nonnegative(),
  removed: z.boolean(),
  addOn: z.boolean(),
});
// Finite schema construction prevents an untrusted recursive response from overflowing Zod.
function itemAtDepth(depth: number): z.ZodType<TableAccountItem> {
  return z.strictObject({
    itemId: canonicalUuidSchema,
    productName: z.string(),
    variationName: z.string().nullable(),
    quantity: z.int32(),
    unitPrice: checkoutAmount,
    itemTotal: checkoutMoney,
    ingredientCustomizations: z.array(ingredient),
    sideItems: z.array(depth === TABLE_ACCOUNT_DEPTH ? z.never() : itemAtDepth(depth + 1)),
  });
}
export const tableAccountItemSchema = itemAtDepth(0);
