import AsyncStorage from '@react-native-async-storage/async-storage';
import { readPublicMenus, removePublicMenu, savePublicMenu } from './publicMenuCache';
import { snapshotIdentity } from '../domain/publicMenuSnapshot';
import { publicMenuFixture } from '../test/publicMenus';
import { tenantA, tenantB } from '../test/fixtures';
import { deferred } from '../test/deferred';
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  jest
    .mocked(AsyncStorage.getItem)
    .mockImplementation((key) => Promise.resolve(values.get(key) ?? null));
  jest.mocked(AsyncStorage.setItem).mockImplementation((key, value) => {
    values.set(key, value);
    return Promise.resolve();
  });
});
it('separates environments and tenant/locale records without persisting credential or runtime authority fields', async () => {
  const first = publicMenuFixture();
  await savePublicMenu('staging', first);
  await savePublicMenu('staging', { ...first, tenantId: tenantB, restaurantName: 'Beta' });
  await savePublicMenu('staging', { ...first, locale: 'fr' });
  expect(await readPublicMenus('staging')).toHaveLength(3);
  expect(await readPublicMenus('production')).toEqual([]);
  expect([...values.keys()]).toEqual(['public.v1.staging.menu-previews']);
  expect(values.get('public.v1.staging.menu-previews')).not.toMatch(
    /token|password|apiOrigin|currency|basePrice/,
  );
  await removePublicMenu('staging', tenantA + ':en');
  expect((await readPublicMenus('staging')).map(snapshotIdentity)).toEqual([
    tenantA + ':fr',
    tenantB + ':en',
  ]);
});
it.each([
  'invalid JSON',
  JSON.stringify({ schemaVersion: 2, snapshots: [] }),
  JSON.stringify({ schemaVersion: 1, snapshots: [], token: 'private' }),
  ' '.repeat(262_145),
])('rejects malformed, incompatible, private or oversized envelopes', async (raw) => {
  values.set('public.v1.staging.menu-previews', raw);
  expect(await readPublicMenus('staging')).toEqual([]);
});
it('filters expired and future records and refuses stale writes before touching storage', async () => {
  const now = Date.now();
  const current = publicMenuFixture(1, now);
  const expired = {
    ...current,
    tenantId: tenantB,
    capturedAt: new Date(now - 604_800_000).toISOString(),
  };
  values.set(
    'public.v1.staging.menu-previews',
    JSON.stringify({ schemaVersion: 1, snapshots: [current, expired] }),
  );
  expect(await readPublicMenus('staging', now)).toEqual([current]);
  expect(() => savePublicMenu('production', expired, now)).toThrow();
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  values.set(
    'public.v1.staging.menu-previews',
    JSON.stringify({
      schemaVersion: 1,
      snapshots: [{ ...current, capturedAt: new Date(now + 60_001).toISOString() }],
    }),
  );
  expect(await readPublicMenus('staging', now)).toEqual([]);
});
it('serializes overlapping writes/removal, rejects old replies and recovers the queue after storage failure', async () => {
  const first = publicMenuFixture();
  const barrier = deferred<void>();
  const entered = deferred<void>();
  jest.mocked(AsyncStorage.setItem).mockImplementationOnce(async (key, value) => {
    entered.resolve();
    await barrier.promise;
    values.set(key, value);
  });
  const save = savePublicMenu('staging', first);
  await entered.promise;
  const other = savePublicMenu('staging', { ...first, tenantId: tenantB });
  const remove = removePublicMenu('staging', snapshotIdentity(first));
  barrier.resolve();
  await Promise.all([save, other, remove]);
  expect((await readPublicMenus('staging')).map((value) => value.tenantId)).toEqual([tenantB]);
  const calls = jest.mocked(AsyncStorage.setItem).mock.calls.length;
  await savePublicMenu('staging', {
    ...first,
    tenantId: tenantB,
    capturedAt: new Date(Date.parse(first.capturedAt) - 1000).toISOString(),
  });
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(calls);
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('device storage unavailable'));
  await expect(savePublicMenu('production', first)).rejects.toThrow();
  await savePublicMenu('production', first);
  expect(await readPublicMenus('production')).toEqual([first]);
});
it('evicts oldest records beyond eight snapshots and refuses one snapshot beyond the total text budget', async () => {
  const first = publicMenuFixture();
  for (let index = 0; index < 9; index++)
    await savePublicMenu('staging', {
      ...first,
      locale: 'en-' + index,
      capturedAt: new Date(Date.parse(first.capturedAt) + index).toISOString(),
    });
  const stored = await readPublicMenus('staging');
  expect(stored).toHaveLength(8);
  expect(stored.at(-1)?.locale).toBe('en-1');
  const large = {
    ...first,
    items: Array.from({ length: 200 }, (_, index) => ({
      id: index.toString(16).padStart(8, '0') + '-0000-4000-8000-000000000000',
      name: 'Large dish',
      description: 'x'.repeat(2000),
      allergens: [],
    })),
  };
  await expect(savePublicMenu('production', large)).rejects.toThrow('text budget');
  expect(await readPublicMenus('production')).toEqual([]);
});
it('keeps storage read failures visible and rejects duplicated snapshot identities', async () => {
  jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(readPublicMenus('staging')).rejects.toThrow();
  const value = publicMenuFixture();
  values.set(
    'public.v1.staging.menu-previews',
    JSON.stringify({ schemaVersion: 1, snapshots: [value, value] }),
  );
  expect(await readPublicMenus('staging')).toEqual([]);
});

it('evicts older whole previews when their combined text exceeds the envelope budget', async () => {
  const first = publicMenuFixture();
  const items = Array.from({ length: 100 }, (_, index) => ({
    id: index.toString(16).padStart(8, '0') + '-0000-4000-8000-000000000000',
    name: 'Long description',
    description: 'x'.repeat(1500),
    allergens: [],
  }));
  await savePublicMenu('staging', { ...first, items });
  await savePublicMenu('staging', {
    ...first,
    tenantId: tenantB,
    items,
    capturedAt: new Date(Date.parse(first.capturedAt) + 1).toISOString(),
  });
  expect((await readPublicMenus('staging')).map((value) => value.tenantId)).toEqual([tenantB]);
  expect(values.get('public.v1.staging.menu-previews')!.length).toBeLessThanOrEqual(262_144);
});
