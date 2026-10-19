import { z } from 'zod';
import { canonicalUuidSchema } from '../core/identifiers';
import { MAX_BASKET_DEPTH, MAX_BASKET_ROWS } from '../domain/basketLimits';
import { checkoutAmount, checkoutMoney } from './checkoutMoney';
const quantityBasis = z.enum(['PerParentUnit', 'LineTotal', 'Unknown']);
const configurationScope = z.enum(['SharedAcrossParentUnits', 'IndependentParentUnits', 'Unknown']);
const compositionRole = z.enum([
  'Menu',
  'Dish',
  'RequiredChoice',
  'Extra',
  'Sauce',
  'Side',
  'Drink',
  'Ingredient',
  'Unknown',
]);
const ingredient = z.object({
  ingredientId: canonicalUuidSchema,
  name: z.string().min(1),
  quantity: z.int32().nonnegative(),
  isRemoved: z.boolean(),
  isAddOn: z.boolean(),
  quantityBasis: quantityBasis.nullish(),
  configurationScope: configurationScope.nullish(),
  compositionRole: compositionRole.nullish(),
  presentationOrder: z.int32().nullish(),
});
const line = z.object({
  basketItemId: canonicalUuidSchema.nullish(),
  productId: canonicalUuidSchema.nullish(),
  menuId: canonicalUuidSchema.nullish(),
  productVariationId: canonicalUuidSchema.nullish(),
  name: z.string().min(1),
  variationName: z.string().nullish(),
  quantity: z.int32().positive(),
  unitPrice: checkoutAmount,
  itemTotal: checkoutMoney,
  specialInstructions: z.string().nullish(),
  kind: z.enum(['BundleChild', 'SideItem', 'CustomizationOption']).nullish(),
  quantityBasis,
  configurationScope,
  compositionRole,
  presentationLabel: z.string().nullish(),
  presentationOrder: z.int32().nullish(),
  ingredients: z.array(ingredient).max(MAX_BASKET_ROWS),
});
export type CheckoutLine = z.infer<typeof line> & { children: CheckoutLine[] };
const recursiveLine: z.ZodType<CheckoutLine> = line.extend({
  children: z.lazy(() => z.array(recursiveLine)),
});
// Check structure iteratively before Zod descends into an untrusted response.
function withinCompositionBudget(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > MAX_BASKET_ROWS) return false;
  const stack = value.map((row) => ({ row: row as unknown, depth: 0 }));
  const seen = new Set<object>();
  let count = 0;
  while (stack.length) {
    const { row, depth } = stack.pop()!;
    if (!row || typeof row !== 'object' || seen.has(row) || depth > MAX_BASKET_DEPTH) return false;
    seen.add(row);
    if (++count > MAX_BASKET_ROWS || !('children' in row) || !Array.isArray(row.children))
      return false;
    if (row.children.length + stack.length > MAX_BASKET_ROWS - count) return false;
    for (const child of row.children) stack.push({ row: child as unknown, depth: depth + 1 });
  }
  return true;
}
export const checkoutItemsSchema = z
  .unknown()
  .refine(withinCompositionBudget)
  .pipe(
    z
      .array(recursiveLine)
      .min(1)
      .superRefine((roots, context) => {
        const ids = new Set<string>();
        const stack = roots.map((row) => ({ row, root: true }));
        while (stack.length) {
          const { row, root } = stack.pop()!;
          if (!row.productId && !row.menuId)
            context.addIssue({
              code: 'custom',
              message: 'A quote line must identify a catalogue item',
            });
          if (root) {
            if (!row.basketItemId || ids.has(row.basketItemId) || row.kind || row.unitPrice < 0)
              context.addIssue({ code: 'custom', message: 'Invalid quote root' });
            if (row.basketItemId) ids.add(row.basketItemId);
          } else if (row.basketItemId || row.itemTotal !== 0 || !row.kind) {
            context.addIssue({ code: 'custom', message: 'Invalid quote component' });
          }
          for (const child of row.children) stack.push({ row: child, root: false });
        }
      }),
  );
