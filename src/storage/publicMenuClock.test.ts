import { PublicMenuCache } from './publicMenuCache';
import { parseDirectory } from '../core/directory';
import { directoryInput, tenantA, tenantB } from '../test/fixtures';
import { publicMenuFixture } from '../test/publicMenus';

const key = 'public.v1.staging.menu-previews';
function setup() {
  const values = new Map<string, string>();
  const storage = {
    getItem: async (id: string) => values.get(id) ?? null,
    setItem: async (id: string, value: string) => {
      values.set(id, value);
    },
  };
  return { values, cache: new PublicMenuCache(storage) };
}
it('a future stored publication cannot override a current trusted removal after restart', async () => {
  const now = Date.now();
  const { values, cache } = setup();
  const first = publicMenuFixture(1, now);
  values.set(
    key,
    JSON.stringify({
      schemaVersion: 1,
      snapshots: [first],
      retention: {
        environment: 'staging',
        publishedAt: new Date(now + 60_001).toISOString(),
        tenantIds: [tenantA, tenantB],
      },
    }),
  );
  const input = directoryInput(now);
  await cache.reconcile(
    parseDirectory({ ...input, tenants: [input.tenants[1]] }, 'staging', now),
    now,
  );
  expect(await cache.read('staging', now)).toEqual([]);
  expect(values.get(key)).not.toContain(tenantA);
  await expect(cache.save('staging', first, now)).rejects.toThrow('no longer permits');
});
it('a clock correction also prevents an in-memory future publication from overriding current removal', async () => {
  const now = Date.now();
  const { cache } = setup();
  const advancedClock = now + 120_000;
  await cache.reconcile(
    parseDirectory(directoryInput(advancedClock), 'staging', advancedClock),
    advancedClock,
  );
  const input = directoryInput(now);
  await cache.reconcile(
    parseDirectory({ ...input, tenants: [input.tenants[1]] }, 'staging', now),
    now,
  );
  await expect(cache.save('staging', publicMenuFixture(1, now), now)).rejects.toThrow(
    'no longer permits',
  );
});
