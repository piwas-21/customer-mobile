import '../../i18n';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { setup, response } from '../../test/transport';
import { compositionProduct } from '../../test/compositions';
import { tenantA, tenantB } from '../../test/fixtures';
import { productIds } from '../../test/products';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useSideDetails from './useSideDetails';
import productQueryKey from './productQueryKey';
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
function sideHook(cached = false, fail = false) {
  const { context, client, fetcher } = setup();
  const product = compositionProduct();
  product.suggestedSideItems = [
    {
      id: tenantB,
      suggestedSideItemId: productIds.sideLink,
      name: 'Drink',
      price: 2,
      type: 'beverage',
      isRequired: false,
      displayOrder: 0,
    },
  ];
  const side = { ...compositionProduct(), id: tenantB };
  const bootstrap = {
    schemaVersion: 1,
    tenantId: tenantA,
    currency: 'EUR',
    locale: 'en',
    timezone: 'Europe/Amsterdam',
    lifecycle: 'active',
    compatibility: 'supported',
    modules: [],
    flags: {},
    capabilities: { menu: 'enabled' },
  };
  fetcher.mockImplementation(async (url) =>
    response(
      { success: true, data: url.includes('bootstrap') ? bootstrap : side },
      !url.includes('bootstrap') && fail ? 503 : 200,
    ),
  );
  const cache = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } },
  });
  if (cached) cache.setQueryData(productQueryKey(context, tenantB, 'en'), side);
  jest.mocked(useRestaurant).mockReturnValue({
    context,
    client,
    directory: undefined,
    loading: false,
    refresh: jest.fn(),
    clear: jest.fn(),
    select: jest.fn(),
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useSideDetails(product), { wrapper });
  return { hook, cache, context, fetcher, product, side, bootstrap };
}
afterEach(() => {
  jest.clearAllMocks();
});
it('loads side metadata into the same scoped cache used by product reads', async () => {
  const { hook, cache, context, side, fetcher } = sideHook();
  try {
    await waitFor(() => expect(hook.result.current.data?.get(tenantB)).toEqual(side));
    expect(cache.getQueryData(productQueryKey(context, tenantB, 'en'))).toEqual(side);
    expect(fetcher.mock.calls.filter(([url]) => url.includes('/Products/'))).toHaveLength(1);
  } finally {
    hook.unmount();
    cache.clear();
  }
});
it('reuses a fresh side detail rather than issuing a new request for the same product', async () => {
  const { hook, cache, side, fetcher } = sideHook(true);
  try {
    await waitFor(() => expect(hook.result.current.data?.get(tenantB)).toEqual(side));
    expect(fetcher.mock.calls.some(([url]) => url.includes('/Products/'))).toBe(false);
  } finally {
    hook.unmount();
    cache.clear();
  }
});
it('withdraws already-loaded metadata when the menu capability is disabled', async () => {
  const { hook, cache, context, bootstrap } = sideHook();
  try {
    await waitFor(() => expect(hook.result.current.data).toBeDefined());
    await act(async () => {
      cache.setQueryData(
        [context.environment, context.tenant.id, 'public', 'bootstrap', 1, context.generation],
        { ...bootstrap, capabilities: { menu: 'disabled' } },
      );
    });
    await waitFor(() => expect(hook.result.current.data).toBeUndefined());
  } finally {
    hook.unmount();
    cache.clear();
  }
});
it('reports unsupported identity sets without sending side requests', async () => {
  const { hook, cache, product, fetcher } = sideHook();
  try {
    product.suggestedSideItems![0]!.id = 'invalid';
    hook.rerender(undefined);
    await waitFor(() => expect(hook.result.current.unsupported).toBe(true));
    expect(hook.result.current.data).toBeUndefined();
    expect(fetcher.mock.calls.some(([url]) => url.includes('/Products/'))).toBe(false);
  } finally {
    hook.unmount();
    cache.clear();
  }
});

it('withholds side metadata when a required detail cannot be read', async () => {
  const { hook, cache, fetcher } = sideHook(false, true);
  try {
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.data).toBeUndefined();
    expect(fetcher.mock.calls.filter(([url]) => url.includes('/Products/'))).toHaveLength(2);
  } finally {
    hook.unmount();
    cache.clear();
  }
});
