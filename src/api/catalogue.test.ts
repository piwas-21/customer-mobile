import { approvedImage, customerName, productSchema, toProductContract } from './catalogue';
import { fixtureDirectory, tenantA } from '../test/fixtures';
import { TenantBoundary } from '../core/tenantContext';
it('uses approved image origins and keeps allergen absence unknown', () => {
  const context = new TenantBoundary(fixtureDirectory()).select(tenantA);
  expect(approvedImage(context, '/images/dish.webp')).toBe(
    'https://alpha.example/images/dish.webp',
  );
  for (const value of [
    'https://evil.example/x',
    'data:image/svg+xml,x',
    'https://user:secret@alpha.example/x',
    '',
  ]) {
    expect(approvedImage(context, value)).toBeUndefined();
  }
  const product = productSchema.parse({
    id: tenantA,
    name: 'Soup',
    basePrice: 12,
    isActive: true,
    isAvailable: true,
    content: { fr: { name: 'Soupe' } },
  });
  expect(customerName(product, 'fr')).toBe('Soupe');
  expect(customerName(product, 'en')).toBe('Soup');
  expect(toProductContract(product).allergens).toBeNull();
});
