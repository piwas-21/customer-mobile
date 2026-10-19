import {
  makePublicMenuSnapshot,
  menuSnapshotIsFresh,
  publicMenuSnapshotSchema,
} from './publicMenuSnapshot';
import { TenantBoundary } from '../core/tenantContext';
import { fixtureDirectory, tenantA } from '../test/fixtures';
import { cacheProduct, menuItemId, publicMenuFixture } from '../test/publicMenus';
it('keeps only bounded public text, translated content and oldest page date without currency, prices, origins or capabilities', () => {
  const context = new TenantBoundary(fixtureDirectory()).select(tenantA);
  const first = Date.now() - 5000;
  const value = makePublicMenuSnapshot(context, 'fr', [
    {
      page: 1,
      totalPages: 2,
      fetchedAt: first,
      items: [
        cacheProduct(1, {
          content: { fr: { name: 'Soupe', description: 'Description française' } },
          imageUrl: 'https://unapproved.example/private',
        }),
        cacheProduct(2, { isComponent: true }),
        cacheProduct(3, { isActive: false }),
      ],
    },
    { page: 2, totalPages: 2, fetchedAt: first + 1000, items: [cacheProduct(1), cacheProduct(4)] },
  ]);
  expect(value).toEqual({
    schemaVersion: 1,
    tenantId: tenantA,
    restaurantName: 'Alpha',
    locale: 'fr',
    capturedAt: new Date(first).toISOString(),
    incomplete: false,
    items: [
      {
        id: menuItemId(1),
        name: 'Soupe',
        description: 'Description française',
        allergens: ['Milk'],
      },
      { id: menuItemId(4), name: 'Soup 4', description: 'Public description', allergens: ['Milk'] },
    ],
  });
  expect(JSON.stringify(value)).not.toMatch(
    /basePrice|currency|imageUrl|https:|isAvailable|canOrder|apiOrigin/,
  );
});
it('caps copied items at200, labels incomplete previews and rejects noncontiguous pages', () => {
  const context = new TenantBoundary(fixtureDirectory()).select(tenantA);
  const page = {
    page: 1,
    totalPages: 1,
    fetchedAt: Date.now(),
    items: Array.from({ length: 201 }, (_, index) => cacheProduct(index + 1)),
  };
  const value = makePublicMenuSnapshot(context, 'en', [page]);
  expect(value.items).toHaveLength(200);
  expect(value.items.at(-1)?.id).toBe(menuItemId(200));
  expect(value.incomplete).toBe(true);
  expect(
    makePublicMenuSnapshot(context, 'en', [{ ...page, totalPages: 2, items: [cacheProduct()] }])
      .incomplete,
  ).toBe(true);
  expect(() => makePublicMenuSnapshot(context, 'en', [])).toThrow();
  expect(() => makePublicMenuSnapshot(context, 'en', [{ ...page, page: 2 }])).toThrow();
});
it('retains no more than seven days and refuses dates beyond the explicit clock-skew allowance', () => {
  const now = Date.now();
  const snapshot = publicMenuFixture(1, now);
  expect(
    menuSnapshotIsFresh(
      { ...snapshot, capturedAt: new Date(now - 604_799_999).toISOString() },
      now,
    ),
  ).toBe(true);
  expect(
    menuSnapshotIsFresh(
      { ...snapshot, capturedAt: new Date(now - 604_800_000).toISOString() },
      now,
    ),
  ).toBe(false);
  expect(
    menuSnapshotIsFresh({ ...snapshot, capturedAt: new Date(now + 60_000).toISOString() }, now),
  ).toBe(true);
  expect(
    menuSnapshotIsFresh({ ...snapshot, capturedAt: new Date(now + 60_001).toISOString() }, now),
  ).toBe(false);
});
it.each([
  { token: 'secret' },
  { apiOrigin: 'https://evil.example' },
  { currency: 'CHF' },
  { schemaVersion: 2 },
  { capabilities: { menu: 'enabled' } },
])('refuses unsupported authority or money envelope fields %j', (patch) => {
  expect(publicMenuSnapshotSchema.safeParse({ ...publicMenuFixture(), ...patch }).success).toBe(
    false,
  );
});
it('refuses nested private fields, duplicate identities and malformed text', () => {
  const value = publicMenuFixture();
  expect(
    publicMenuSnapshotSchema.safeParse({
      ...value,
      items: [{ ...value.items[0], userId: tenantA }],
    }).success,
  ).toBe(false);
  expect(
    publicMenuSnapshotSchema.safeParse({ ...value, items: [value.items[0], value.items[0]] })
      .success,
  ).toBe(false);
  expect(
    publicMenuSnapshotSchema.safeParse({ ...value, items: [{ ...value.items[0], name: '' }] })
      .success,
  ).toBe(false);
  expect(
    makePublicMenuSnapshot(new TenantBoundary(fixtureDirectory()).select(tenantA), 'en', [
      {
        page: 1,
        totalPages: 1,
        fetchedAt: Date.now(),
        items: [cacheProduct(1, { description: null, allergens: null })],
      },
    ]).items[0],
  ).toMatchObject({ description: null, allergens: [] });
});
