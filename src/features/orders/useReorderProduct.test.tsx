import '../../i18n';
import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
import { sessionSetup } from '../../test/sessions';
import { response } from '../../test/transport';
import { productDetailFixture } from '../../test/products';
import { deferred } from '../../test/deferred';
import { reorderCandidates } from '../../domain/reorder';
import { receiptResponse } from '../../test/orderReceipt';
import productQueryKey from '../menu/productQueryKey';
import useReorderProduct from './useReorderProduct';
jest.mock('../account/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../restaurant/useBootstrap');
async function setup() {
  const f = await sessionSetup();
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const product = productDetailFixture();
  const candidate = reorderCandidates([
    { ...receiptResponse().items[0]!, productId: product.id },
  ])[0]!;
  f.fetcher.mockResolvedValue(response({ success: true, data: product }));
  jest.mocked(useBootstrap).mockReturnValue({
    data: {
      schemaVersion: 1,
      tenantId: f.context.tenant.id,
      currency: 'CHF',
      locale: 'en',
      timezone: 'Europe/Zurich',
      lifecycle: 'active',
      compatibility: 'supported',
      modules: [],
      flags: {},
      capabilities: { ordering: 'enabled', menu: 'enabled' },
    },
  } as unknown as ReturnType<typeof useBootstrap>);
  jest.mocked(useRestaurant).mockReturnValue({
    context: f.context,
    client: f.client,
    directory: undefined,
    loading: false,
    refresh: jest.fn(),
    clear: jest.fn(),
    select: jest.fn(),
  });
  const sessionState = () => ({
    controller: f.controller,
    userId: f.controller.userId,
    ownerVersion: f.controller.ownerVersion,
    needsCleanup: f.controller.needsCleanup,
    needsPaymentAttention: f.controller.needsPaymentAttention,
    loading: false,
    unavailable: false,
    failed: false,
    retry: jest.fn(),
  });
  jest.mocked(useSession).mockImplementation(sessionState);
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    ({ request }: { request: string }) => useReorderProduct(candidate, request, 'Takeaway'),
    {
      initialProps: { request: 'first-attempt' },
      wrapper,
    },
  );
  return {
    ...f,
    cache,
    product,
    hook,
    dispose: () => {
      hook.unmount();
      cache.clear();
      f.controller.dispose();
    },
  };
}
afterEach(() => jest.clearAllMocks());
it('fetches current detail despite a fresh public cache and keeps the historical choice private', async () => {
  const f = await setup();
  try {
    f.cache.setQueryData(productQueryKey(f.context, f.product.id, 'en', 'Takeaway'), {
      ...f.product,
      name: 'Old menu',
    });
    await waitFor(() => expect(f.hook.result.current.product?.name).toBe(f.product.name));
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    const query = f.cache
      .getQueryCache()
      .findAll()
      .find((q) => q.queryKey[3] === 'reorder-product')!;
    expect(query.queryKey.slice(0, 4)).toEqual([
      f.context.environment,
      f.context.tenant.id,
      `customer:${f.controller.userId}`,
      'reorder-product',
    ]);
    expect(query.options.gcTime).toBe(0);
    expect(f.hook.result.current.freshKey[0]).toBe(`customer:${f.controller.userId}`);
    f.hook.unmount();
    expect(
      f.cache
        .getQueryCache()
        .findAll()
        .filter((q) => q.queryKey[3] === 'reorder-product'),
    ).toHaveLength(0);
  } finally {
    f.dispose();
  }
});
it('hides a prior result while a new explicit read is unresolved and does not retry failures', async () => {
  const f = await setup();
  const pending = deferred<Response>();
  try {
    await waitFor(() => expect(f.hook.result.current.product).toBeDefined());
    f.fetcher.mockImplementationOnce(() => pending.promise);
    act(() => f.hook.result.current.refresh());
    expect(f.hook.result.current.product).toBeUndefined();
    await waitFor(() => expect(f.fetcher).toHaveBeenCalledTimes(2));
    await act(async () => pending.resolve(response({}, 503)));
    await waitFor(() => expect(f.hook.result.current.failed).toBe(true));
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    expect(f.hook.result.current.product).toBeUndefined();
    act(() => f.hook.result.current.refresh());
    await waitFor(() => expect(f.hook.result.current.product).toBeDefined());
    expect(f.fetcher).toHaveBeenCalledTimes(3);
  } finally {
    pending.resolve(response({}, 503));
    f.dispose();
  }
});
it('rejects a late response after the captured account has withdrawn', async () => {
  const f = await setup();
  const pending = deferred<Response>();
  try {
    await waitFor(() => expect(f.hook.result.current.product).toBeDefined());
    f.fetcher.mockImplementationOnce(() => pending.promise);
    act(() => f.hook.result.current.refresh());
    await waitFor(() => expect(f.fetcher).toHaveBeenCalledTimes(2));
    await act(async () => {
      await f.controller.logout();
      pending.resolve(response({ success: true, data: f.product }));
    });
    await waitFor(() => expect(f.hook.result.current.failed).toBe(true));
    expect(f.hook.result.current.product).toBeUndefined();
  } finally {
    pending.resolve(response({}, 503));
    f.dispose();
  }
});
it('withdraws cached detail immediately when ordering becomes unavailable', async () => {
  const f = await setup();
  try {
    await waitFor(() => expect(f.hook.result.current.product).toBeDefined());
    const bootstrap = jest.mocked(useBootstrap).mock.results[0]!.value as ReturnType<
      typeof useBootstrap
    >;
    jest
      .mocked(useBootstrap)
      .mockReturnValue({ ...bootstrap, data: { ...bootstrap.data!, lifecycle: 'read-only' } });
    f.hook.rerender({ request: 'first-attempt' });
    expect(f.hook.result.current.product).toBeUndefined();
    expect(f.hook.result.current.allowed).toBe(false);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  } finally {
    f.dispose();
  }
});
it('rejects a successful response for a different product identity', async () => {
  const f = await setup();
  try {
    await waitFor(() => expect(f.hook.result.current.product).toBeDefined());
    f.fetcher.mockResolvedValueOnce(
      response({
        success: true,
        data: { ...f.product, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
      }),
    );
    act(() => f.hook.result.current.refresh());
    await waitFor(() => expect(f.hook.result.current.failed).toBe(true));
    expect(f.hook.result.current.product).toBeUndefined();
  } finally {
    f.dispose();
  }
});
