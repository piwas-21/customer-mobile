import { PublicMenuCache } from './publicMenuCache';
import { parseDirectory } from '../core/directory';
import { directoryInput, tenantA, tenantB } from '../test/fixtures';
import { publicMenuFixture } from '../test/publicMenus';
import { deferred } from '../test/deferred';

const key = 'public.v1.staging.menu-previews';
const now = Date.now();
function directory(tenantIds: string[], published = now - 1000) {
  const input = directoryInput(now);
  return parseDirectory(
    {
      ...input,
      publishedAt: new Date(published).toISOString(),
      tenants: input.tenants.filter((tenant) => tenantIds.includes(tenant.id)),
    },
    'staging',
    now,
  );
}
function setup() {
  const values = new Map<string, string>();
  const storage = {
    getItem: jest.fn(async (id: string) => values.get(id) ?? null),
    setItem: jest.fn(async (id: string, value: string) => {
      values.set(id, value);
    }),
  };
  return { values, storage, cache: new PublicMenuCache(storage) };
}
it('purges removed previews and durably prevents late writes after restart, independently per environment', async () => {
  const { cache, values, storage } = setup();
  const first = publicMenuFixture(1, now);
  const other = { ...first, tenantId: tenantB };
  await cache.save('staging', first, now);
  await cache.save('staging', other, now);
  await cache.save('production', first, now);
  values.set('private.purchase-record', 'untouched');
  await cache.reconcile(directory([tenantB]), now);
  expect(await cache.read('staging', now)).toEqual([other]);
  expect(values.get(key)).not.toContain(tenantA);
  const restarted = new PublicMenuCache(storage);
  await expect(restarted.save('staging', first, now)).rejects.toThrow('no longer permits');
  expect(await restarted.read('staging', now)).toEqual([other]);
  expect(await restarted.read('production', now)).toEqual([first]);
  expect(values.get('private.purchase-record')).toBe('untouched');
  expect(values.get(key)).not.toMatch(/apiOrigin|webOrigin|imageOrigin|token|email|password|role/);
});
it('retains read-only tenants, purges disabled and incompatible tenants, and refuses expired observations', async () => {
  const { cache } = setup();
  const first = publicMenuFixture(1, now);
  await cache.save('staging', first, now);
  const input = directoryInput(now);
  input.tenants[0]!.status = 'read-only';
  await cache.reconcile(parseDirectory(input, 'staging', now), now);
  expect(await cache.read('staging', now)).toEqual([first]);
  expect(() => cache.reconcile(directory([]), now + 61_000)).toThrow();
  expect(await cache.read('staging', now)).toEqual([first]);
  input.publishedAt = new Date(now).toISOString();
  input.tenants[0]!.status = 'disabled';
  input.tenants[1]!.contractVersions = [2];
  await cache.reconcile(parseDirectory(input, 'staging', now), now);
  expect(await cache.read('staging', now)).toEqual([]);
});
it('ignores old publications, intersects conflicts, and permits reactivation only in a newer publication', async () => {
  const { cache } = setup();
  const first = publicMenuFixture(1, now);
  await cache.reconcile(directory([tenantB]), now);
  await cache.reconcile(directory([tenantA, tenantB], now - 2000), now);
  await expect(cache.save('staging', first, now)).rejects.toThrow();
  await cache.reconcile(directory([tenantA, tenantB]), now);
  await expect(cache.save('staging', first, now)).rejects.toThrow();
  await cache.reconcile(directory([tenantA, tenantB], now), now);
  await cache.save('staging', first, now);
  expect(await cache.read('staging', now)).toEqual([first]);
});
it('fences reads and queued saves while an old disk write is pending, then purges its result', async () => {
  const { cache, storage, values } = setup();
  const first = publicMenuFixture(1, now);
  const entered = deferred<void>();
  const release = deferred<void>();
  storage.setItem.mockImplementationOnce(async (id, value) => {
    entered.resolve();
    await release.promise;
    values.set(id, value);
  });
  const old = cache.save('staging', first, now);
  await entered.promise;
  const cleanup = cache.reconcile(directory([tenantB]), now);
  const late = cache.save('staging', first, now);
  const rejection = expect(late).rejects.toThrow('no longer permits');
  release.resolve();
  await old;
  expect(await cache.read('staging', now)).toEqual([]);
  await cleanup;
  await rejection;
  expect(values.get(key)).not.toContain(tenantA);
});
it('filters an already pending read against the newly observed policy after storage returns', async () => {
  const { cache, storage, values } = setup();
  const first = publicMenuFixture(1, now);
  await cache.save('staging', first, now);
  const oldRaw = values.get(key)!;
  const read = deferred<string | null>();
  storage.getItem.mockImplementationOnce(() => read.promise);
  const pending = cache.read('staging', now);
  const cleanup = cache.reconcile(directory([]), now);
  read.resolve(oldRaw);
  expect(await pending).toEqual([]);
  await cleanup;
});
it('does not acknowledge failed or discarded cleanup, retains its fence, and retries successfully', async () => {
  const { cache, storage, values } = setup();
  const first = publicMenuFixture(1, now);
  await cache.save('staging', first, now);
  storage.setItem.mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(cache.reconcile(directory([]), now)).rejects.toThrow('storage unavailable');
  expect(values.get(key)).toContain(tenantA);
  expect(await cache.read('staging', now)).toEqual([]);
  storage.setItem.mockResolvedValueOnce(undefined);
  await expect(cache.reconcile(directory([]), now)).rejects.toThrow('unconfirmed');
  await cache.reconcile(directory([]), now);
  expect(values.get(key)).not.toContain(tenantA);
  expect(await new PublicMenuCache(storage).read('staging', now)).toEqual([]);
});
it.each([
  { environment: 'production', publishedAt: new Date(now).toISOString(), tenantIds: [] },
  { environment: 'staging', publishedAt: 'invalid', tenantIds: [] },
  {
    environment: 'staging',
    publishedAt: new Date(now).toISOString(),
    tenantIds: [tenantA, tenantA],
  },
  {
    environment: 'staging',
    publishedAt: new Date(now).toISOString(),
    tenantIds: [],
    token: 'private',
  },
])('rejects malformed or cross-environment retention records', async (retention) => {
  const { cache, values } = setup();
  values.set(
    key,
    JSON.stringify({ schemaVersion: 1, snapshots: [publicMenuFixture(1, now)], retention }),
  );
  expect(await cache.read('staging', now)).toEqual([]);
});
