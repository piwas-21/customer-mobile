import { PublicMenuCache } from './publicMenuCache';
import { publicMenuFixture } from '../test/publicMenus';
import { tenantB, fixtureDirectory } from '../test/fixtures';
import { deferred } from '../test/deferred';
const key = 'public.v1.staging.menu-previews';
const lifetime = 604_800_000;
function fixture() {
  const values = new Map<string, string>();
  const storage = {
    getItem: jest.fn(async (name: string) => values.get(name) ?? null),
    setItem: jest.fn(async (name: string, value: string) => {
      values.set(name, value);
    }),
  };
  return { values, storage, cache: new PublicMenuCache(storage) };
}
it('physically removes expired and future previews while preserving a current preview, retention and unrelated keys', async () => {
  const f = fixture();
  const now = Date.now();
  const current = publicMenuFixture(1, now);
  const retention = {
    environment: 'staging',
    publishedAt: new Date(now - 1000).toISOString(),
    tenantIds: [current.tenantId, tenantB],
  };
  f.values.set(
    key,
    JSON.stringify({
      schemaVersion: 1,
      retention,
      snapshots: [
        current,
        { ...current, tenantId: tenantB, capturedAt: new Date(now - lifetime).toISOString() },
        { ...current, locale: 'fr', capturedAt: new Date(now + 60_001).toISOString() },
      ],
    }),
  );
  f.values.set('private.purchase', 'original-private-proof');
  f.values.set('public.v1.production.menu-previews', 'other-environment');
  expect(await f.cache.prune('staging', () => now)).toBe(now - 1000 + lifetime);
  expect(JSON.parse(f.values.get(key)!)).toEqual({
    schemaVersion: 1,
    retention,
    snapshots: [current],
  });
  expect(f.values.get('private.purchase')).toBe('original-private-proof');
  expect(f.values.get('public.v1.production.menu-previews')).toBe('other-environment');
});
it.each(['invalid JSON', '{"schemaVersion":2,"snapshots":[]}', ' '.repeat(262_145)])(
  'replaces an invalid public envelope with a bounded empty envelope',
  async (raw) => {
    const f = fixture();
    f.values.set(key, raw);
    expect(await f.cache.prune('staging')).toBeUndefined();
    expect(JSON.parse(f.values.get(key)!)).toEqual({ schemaVersion: 1, snapshots: [] });
  },
);
it('rechecks expiry after a delayed disk read and preserves a retirement fence across restart', async () => {
  const f = fixture();
  const started = Date.now();
  await f.cache.save('staging', publicMenuFixture(1, started), started);
  await f.cache.reconcile(fixtureDirectory(), started);
  const disk = deferred<string | null>();
  f.storage.getItem.mockReturnValueOnce(disk.promise);
  let now = started;
  const cleanup = f.cache.prune('staging', () => now);
  await Promise.resolve();
  now = started + lifetime;
  disk.resolve(f.values.get(key)!);
  expect(await cleanup).toBeUndefined();
  const stored = JSON.parse(f.values.get(key)!);
  expect(stored.snapshots).toEqual([]);
  expect(stored.retention).toBeDefined();
  const restarted = new PublicMenuCache(f.storage);
  expect(await restarted.read('staging', now)).toEqual([]);
});
it('queues cleanup behind a suspended save and does not let that save restore expired bytes', async () => {
  const f = fixture();
  const now = Date.now();
  const write = deferred<void>();
  const entered = deferred<void>();
  f.storage.setItem.mockImplementationOnce(async (name, value) => {
    entered.resolve();
    await write.promise;
    f.values.set(name, value);
  });
  const save = f.cache.save('staging', publicMenuFixture(1, now), now);
  await entered.promise;
  const cleanup = f.cache.prune('staging', () => now + lifetime);
  write.resolve();
  await save;
  expect(await cleanup).toBeUndefined();
  expect(JSON.parse(f.values.get(key)!).snapshots).toEqual([]);
});
it('rejects an unacknowledged disk cleanup and permits a later retry', async () => {
  const f = fixture();
  f.storage.setItem.mockResolvedValueOnce();
  await expect(f.cache.prune('staging')).rejects.toThrow('unconfirmed');
  await expect(f.cache.prune('staging')).resolves.toBeUndefined();
  expect(f.values.get(key)).toBe('{"schemaVersion":1,"snapshots":[]}');
});
it('announces successful saves/removals by environment without recursively announcing cleanup', async () => {
  const f = fixture();
  const changed = jest.fn();
  const unsubscribe = f.cache.subscribe(changed);
  const snapshot = publicMenuFixture();
  await f.cache.save('staging', snapshot);
  await f.cache.prune('staging');
  await f.cache.remove('staging', snapshot.tenantId + ':en');
  expect(changed.mock.calls).toEqual([['staging'], ['staging']]);
  unsubscribe();
  await f.cache.save('production', snapshot);
  expect(changed).toHaveBeenCalledTimes(2);
});
