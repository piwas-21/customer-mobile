import { PublicMenuCache } from './publicMenuCache';
import { parseDirectory } from '../core/directory';
import { directoryInput, tenantA } from '../test/fixtures';
import { publicMenuFixture } from '../test/publicMenus';
import { deferred } from '../test/deferred';

function setup() {
  const values = new Map<string, string>();
  const storage = {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
  };
  return { values, storage, cache: new PublicMenuCache(storage) };
}
function removal(now: number) {
  const input = directoryInput(now);
  return parseDirectory({ ...input, tenants: [input.tenants[1]] }, 'staging', now);
}
it.each(['read', 'save'] as const)(
  'an old paused %s cannot erase a newer publication fence',
  async (operation) => {
    const now = Date.now();
    const { cache, storage, values } = setup();
    const first = publicMenuFixture(1, now);
    await cache.save('staging', first, now);
    const raw = values.get('public.v1.staging.menu-previews')!;
    const pending = deferred<string | null>();
    const entered = deferred<void>();
    storage.getItem.mockImplementationOnce(() => {
      entered.resolve();
      return pending.promise;
    });
    const old =
      operation === 'read' ? cache.read('staging', now) : cache.save('staging', first, now);
    await entered.promise;
    const later = now + 120_000;
    const cleanup = cache.reconcile(removal(later), later);
    pending.resolve(raw);
    const results = await Promise.allSettled([old, cleanup]);
    if (operation === 'read') expect(results[0]).toEqual({ status: 'fulfilled', value: [] });
    else expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('fulfilled');
    const restarted = new PublicMenuCache(storage);
    expect(await restarted.read('staging', later)).toEqual([]);
    await expect(
      restarted.save('staging', { ...first, capturedAt: new Date(later).toISOString() }, later),
    ).rejects.toThrow('no longer permits');
    expect(values.get('public.v1.staging.menu-previews')).not.toContain(tenantA);
  },
);
it('a read started before a clock correction cannot restore the previous future policy', async () => {
  const now = Date.now();
  const advanced = now + 120_000;
  const { cache, storage, values } = setup();
  await cache.reconcile(parseDirectory(directoryInput(advanced), 'staging', advanced), advanced);
  const raw = values.get('public.v1.staging.menu-previews')!;
  const pending = deferred<string | null>();
  storage.getItem.mockImplementationOnce(() => pending.promise);
  const old = cache.read('staging', advanced);
  const cleanup = cache.reconcile(removal(now), now);
  pending.resolve(raw);
  await Promise.all([old, cleanup]);
  await expect(cache.save('staging', publicMenuFixture(1, now), now)).rejects.toThrow(
    'no longer permits',
  );
  const restarted = new PublicMenuCache(storage);
  await expect(restarted.save('staging', publicMenuFixture(1, now), now)).rejects.toThrow(
    'no longer permits',
  );
});
