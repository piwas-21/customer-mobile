import { z } from 'zod';
import type { CheckoutLine } from '../api/checkoutComposition';
import { canonicalUuidSchema } from '../core/identifiers';
import { quantityIsValid } from './customization';
const seedSchema = z.strictObject({
  quantity: z.number().int().refine(quantityIsValid),
  instructions: z.string().max(500),
});
export type ReorderSeed = Readonly<z.infer<typeof seedSchema>>;
export type ReorderCandidate = Readonly<{
  key: string;
  productId: string | null;
  name: string;
  variationName: string | null;
  quantity: number;
  seed: ReorderSeed | null;
}>;
export function reorderCandidates(roots: readonly CheckoutLine[]): readonly ReorderCandidate[] {
  return roots.map((row, index) => {
    const product = canonicalUuidSchema.safeParse(row.productId);
    const seed = seedSchema.safeParse({
      quantity: row.quantity,
      instructions: row.specialInstructions ?? '',
    });
    return {
      // Receipt roots are immutable and intentionally omit historical item identities. Repeated
      // copies of a product must remain separate choices rather than collapsing by product UUID.
      key: String(index),
      productId: product.success ? product.data : null,
      name: row.name,
      variationName: row.variationName ?? null,
      quantity: row.quantity,
      seed: product.success && seed.success ? Object.freeze(seed.data) : null,
    };
  });
}
export function applyReorderSeed<T extends Readonly<{ quantity: number; instructions: string }>>(
  defaults: T,
  seed: ReorderSeed | undefined,
): T {
  // Historical variation, recipe/choice IDs, children and prices are not a current configuration.
  // Always use today's plan and require its normal choice/price review before the ordinary add.
  return seed ? { ...defaults, ...seedSchema.parse(seed) } : defaults;
}
