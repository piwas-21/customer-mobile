import { type PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import useOrderTypes from './useOrderTypes';
import useBootstrap from '../restaurant/useBootstrap';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import { bootstrapSchema } from '../../core/capabilities';
import { basketControllerFixture } from '../../test/basketController';
import { response } from '../../test/transport';
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../restaurant/useBootstrap', () => ({ __esModule: true, default: jest.fn() }));
async function setup() {
  const f = await basketControllerFixture();
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  jest
    .mocked(useRestaurant)
    .mockReturnValue({ context: f.context, client: f.client } as ReturnType<typeof useRestaurant>);
  jest
    .mocked(useBootstrap)
    .mockReturnValue({ data: bootstrapSchema.parse(f.bootstrap) } as ReturnType<
      typeof useBootstrap
    >);
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={cache}>{children}</QueryClientProvider>;
  }
  const hook = renderHook(({ open }: { open: boolean }) => useOrderTypes(open), {
    wrapper: Wrapper,
    initialProps: { open: false },
  });
  return {
    ...f,
    hook,
    close: () => {
      hook.unmount();
      cache.clear();
    },
  };
}
it('reads options lazily from the selected tenant without creating private sessions or writes', async () => {
  const f = await setup();
  try {
    expect(f.fetcher).not.toHaveBeenCalled();
    f.fetcher.mockResolvedValue(response({ success: true, data: ['Delivery', 'Takeaway'] }));
    f.hook.rerender({ open: true });
    await waitFor(() => expect(f.hook.result.current.data).toEqual(['Delivery', 'Takeaway']));
    const [url, request] = f.fetcher.mock.calls[0]!;
    expect(url).toContain('/api/OrderTypeConfiguration/enabled');
    expect(request.method).toBe('GET');
    expect(request.headers).not.toHaveProperty('Authorization');
    expect(request.headers).not.toHaveProperty('X-Session-Id');
    expect(f.store.values.size).toBe(0);
  } finally {
    f.close();
  }
});
it('withdraws cached options after a failed read and when ordering eligibility disappears', async () => {
  const f = await setup();
  try {
    f.fetcher.mockResolvedValue(response({ success: true, data: ['Takeaway'] }));
    f.hook.rerender({ open: true });
    await waitFor(() => expect(f.hook.result.current.data).toEqual(['Takeaway']));
    f.fetcher.mockResolvedValue(response({}, 503));
    await act(async () => {
      await f.hook.result.current.refetch();
    });
    await waitFor(() => expect(f.hook.result.current.isError).toBe(true));
    expect(f.hook.result.current.data).toBeUndefined();
    jest
      .mocked(useBootstrap)
      .mockReturnValue({ data: undefined } as ReturnType<typeof useBootstrap>);
    f.hook.rerender({ open: true });
    expect(f.hook.result.current.data).toBeUndefined();
    expect(f.hook.result.current.isPending).toBe(false);
  } finally {
    f.close();
  }
});
