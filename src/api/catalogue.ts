import { z } from 'zod';
import type { components } from './generated';
import type { CustomerTransport } from '../core/transport';
import type { TenantContext } from '../core/tenantContext';
const contentSchema = z.record(
  z.string(),
  z.object({ name: z.string().nullish(), description: z.string().nullish() }),
);
export const productSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  description: z.string().nullish(),
  basePrice: z.number().finite().nonnegative(),
  imageUrl: z.string().nullish(),
  isActive: z.boolean(),
  isAvailable: z.boolean(),
  isComponent: z.boolean().optional(),
  allergens: z.array(z.string()).nullish(),
  content: contentSchema.nullish(),
  availability: z.object({ canOrder: z.boolean() }).nullish(),
  variationCount: z.number().int().nonnegative().optional(),
});
export type Product = z.infer<typeof productSchema>;
const pageSchema = z.object({
  items: z.array(productSchema),
  totalPages: z.number().int().nonnegative(),
  page: z.number().int().positive(),
});
export function readProducts(
  client: CustomerTransport,
  context: TenantContext,
  page: number,
  locale: string,
) {
  return client.request(
    context,
    `/api/Products?Page=${page}&PageSize=30&IncludeMenus=true&GuestAllView=true`,
    pageSchema,
    { locale },
  );
}
export function customerName(product: Product, locale: string): string {
  return product.content?.[locale]?.name || product.name || '';
}
export function approvedImage(
  context: TenantContext,
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, context.tenant.imageOrigin);
    if (
      url.origin !== context.tenant.imageOrigin ||
      url.username ||
      url.password ||
      url.protocol !== 'https:'
    )
      return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}
// Compile-time agreement with the production OpenAPI subset; runtime schemas validate network values.
export function toProductContract(product: Product): components['schemas']['ProductSummaryDto'] {
  return {
    id: product.id,
    name: product.name,
    basePrice: product.basePrice,
    isActive: product.isActive,
    isAvailable: product.isAvailable,
    description: product.description ?? null,
    imageUrl: product.imageUrl ?? null,
    allergens: product.allergens ?? null,
  };
}
