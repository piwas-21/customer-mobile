import type { Product } from '../api/catalogue';
import type { PublicMenuSnapshot } from '../domain/publicMenuSnapshot';
import { tenantA } from './fixtures';
export function menuItemId(index = 1) {
  return index.toString(16).padStart(8, '0') + '-0000-4000-8000-000000000000';
}
export function publicMenuFixture(index = 1, now = Date.now()): PublicMenuSnapshot {
  return {
    schemaVersion: 1,
    tenantId: tenantA,
    restaurantName: 'Alpha',
    locale: 'en',
    capturedAt: new Date(now - 1000).toISOString(),
    incomplete: false,
    items: [
      {
        id: menuItemId(index),
        name: 'Cached soup',
        description: 'Saved description',
        allergens: ['Milk'],
      },
    ],
  };
}
export function cacheProduct(index = 1, patch: Partial<Product> = {}): Product {
  return {
    id: menuItemId(index),
    name: 'Soup ' + index,
    description: 'Public description',
    basePrice: 9,
    isActive: true,
    isAvailable: true,
    allergens: ['Milk'],
    ...patch,
  };
}
