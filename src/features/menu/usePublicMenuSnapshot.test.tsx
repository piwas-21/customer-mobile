import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { Bootstrap } from '../../core/capabilities';
import { TenantBoundary } from '../../core/tenantContext';
import { fixtureDirectory, tenantA, tenantB } from '../../test/fixtures';
import { cacheProduct } from '../../test/publicMenus';
import { savePublicMenu } from '../../storage/publicMenuCache';
import usePublicMenuSnapshot from './usePublicMenuSnapshot';
jest.mock('../../storage/publicMenuCache', () => ({ savePublicMenu: jest.fn() }));
const bootstrap: Bootstrap = {
  schemaVersion: 1,
  tenantId: tenantA,
  currency: 'CHF',
  locale: 'en',
  timezone: 'Europe/Zurich',
  lifecycle: 'active',
  compatibility: 'supported',
  modules: [],
  flags: {},
  capabilities: { menu: 'enabled' },
};
it('writes a fresh successful public projection only after the current menu is ready', async () => {
  const context = new TenantBoundary(fixtureDirectory()).select(tenantA);
  const pages = [{ page: 1, totalPages: 2, fetchedAt: Date.now(), items: [cacheProduct()] }];
  jest.mocked(savePublicMenu).mockResolvedValue(undefined);
  const screen = renderHook(
    ({ ready }: { ready: boolean }) =>
      usePublicMenuSnapshot(context, bootstrap, 'en', pages, ready),
    {
      initialProps: { ready: false },
    },
  );
  expect(savePublicMenu).not.toHaveBeenCalled();
  screen.rerender({ ready: true });
  await waitFor(() => expect(savePublicMenu).toHaveBeenCalledTimes(1));
  expect(savePublicMenu).toHaveBeenCalledWith(
    'staging',
    expect.objectContaining({
      tenantId: tenantA,
      locale: 'en',
      incomplete: true,
      restaurantName: 'Alpha',
    }),
  );
  const raw = JSON.stringify(jest.mocked(savePublicMenu).mock.calls[0]![1]);
  expect(raw).not.toMatch(/basePrice|currency|token|apiOrigin|isAvailable/);
  screen.unmount();
});
it.each([
  'disabled',
  'incompatible',
  'missing-context',
  'missing-bootstrap',
  'missing-pages',
  'foreign-bootstrap',
] as const)('never caches an unavailable or untrusted menu: %s', async (mode) => {
  const context = new TenantBoundary(fixtureDirectory()).select(tenantA);
  const policy = {
    ...bootstrap,
    tenantId: mode === 'foreign-bootstrap' ? tenantB : tenantA,
    lifecycle: mode === 'disabled' ? ('disabled' as const) : ('active' as const),
    compatibility: mode === 'incompatible' ? ('update-required' as const) : ('supported' as const),
  };
  const screen = renderHook(() =>
    usePublicMenuSnapshot(
      mode === 'missing-context' ? undefined : context,
      mode === 'missing-bootstrap' ? undefined : policy,
      'en',
      mode === 'missing-pages'
        ? undefined
        : [{ page: 1, totalPages: 1, fetchedAt: Date.now(), items: [cacheProduct()] }],
      true,
    ),
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(savePublicMenu).not.toHaveBeenCalled();
  screen.unmount();
});
it('isolates asynchronous storage failures and rejects invalid projection input without interrupting online browsing', async () => {
  const context = new TenantBoundary(fixtureDirectory()).select(tenantA);
  jest.mocked(savePublicMenu).mockRejectedValueOnce(new Error('storage unavailable'));
  const pages = [{ page: 1, totalPages: 1, fetchedAt: Date.now(), items: [cacheProduct()] }];
  const screen = renderHook(
    ({ valid }: { valid: boolean }) =>
      usePublicMenuSnapshot(
        context,
        bootstrap,
        'en',
        valid ? pages : [{ ...pages[0]!, page: 2 }],
        true,
      ),
    { initialProps: { valid: true } },
  );
  await waitFor(() => expect(savePublicMenu).toHaveBeenCalledTimes(1));
  await act(async () => screen.rerender({ valid: false }));
  expect(savePublicMenu).toHaveBeenCalledTimes(1);
  screen.unmount();
});
