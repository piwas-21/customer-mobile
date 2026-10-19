import { z } from 'zod';
import { customerName, type Product } from '../api/catalogue';
import type { TenantContext } from '../core/tenantContext';
export const PUBLIC_MENU_MAX_ITEMS = 200;
export const PUBLIC_MENU_MAX_SNAPSHOTS = 8;
export const PUBLIC_MENU_MAX_TEXT_UNITS = 262_144;
export const PUBLIC_MENU_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 60_000;
const itemSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
  allergens: z.array(z.string().max(100)).max(50),
});
export const publicMenuSnapshotSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    tenantId: z.uuid(),
    restaurantName: z.string().min(1).max(120),
    locale: z.string().min(2).max(32),
    capturedAt: z.iso.datetime(),
    incomplete: z.boolean(),
    items: z.array(itemSchema).max(PUBLIC_MENU_MAX_ITEMS),
  })
  .refine(
    (snapshot) => new Set(snapshot.items.map((item) => item.id)).size === snapshot.items.length,
  );
export type PublicMenuSnapshot = z.infer<typeof publicMenuSnapshotSchema>;
export type PublicMenuItem = z.infer<typeof itemSchema>;
export function menuSnapshotIsFresh(snapshot: PublicMenuSnapshot, now: number) {
  const captured = Date.parse(snapshot.capturedAt);
  return captured <= now + CLOCK_SKEW_MS && captured > now - PUBLIC_MENU_MAX_AGE_MS;
}
export function snapshotIdentity(snapshot: PublicMenuSnapshot) {
  return snapshot.tenantId + ':' + snapshot.locale;
}
export function makePublicMenuSnapshot(
  context: TenantContext,
  locale: string,
  pages: readonly {
    items: readonly Product[];
    page: number;
    totalPages: number;
    fetchedAt: number;
  }[],
): PublicMenuSnapshot {
  if (!pages.length || pages.some((page, index) => page.page !== index + 1))
    throw new Error('A saved menu requires contiguous public pages');
  const seen = new Set<string>();
  const items: PublicMenuItem[] = [];
  let incomplete = pages.length < pages[0]!.totalPages;
  rows: for (const page of pages)
    for (const product of page.items) {
      if (!product.isActive || product.isComponent || seen.has(product.id)) continue;
      if (items.length === PUBLIC_MENU_MAX_ITEMS) {
        incomplete = true;
        break rows;
      }
      seen.add(product.id);
      items.push({
        id: product.id,
        name: customerName(product, locale),
        description: product.content?.[locale]?.description ?? product.description ?? null,
        allergens: product.allergens ?? [],
      });
    }
  return publicMenuSnapshotSchema.parse({
    schemaVersion: 1,
    tenantId: context.tenant.id,
    restaurantName: context.tenant.name,
    locale,
    capturedAt: new Date(
      pages.reduce((oldest, page) => Math.min(oldest, page.fetchedAt), Infinity),
    ).toISOString(),
    incomplete,
    items,
  });
}
