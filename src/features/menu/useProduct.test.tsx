import '../../i18n';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import type { OrderType } from '../../api/productDetail';
import { setup, response } from '../../test/transport';
import { productDetailFixture } from '../../test/products';
import { tenantA } from '../../test/fixtures';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useProduct from './useProduct';
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
const clients: QueryClient[] = [];
function productHook() {
  const { context, client, fetcher } = setup();
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
    response({
      success: true,
      data: url.includes('bootstrap')
        ? bootstrap
        : {
            ...productDetailFixture(),
            availability: { canOrder: url.includes('Takeaway') },
          },
    }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  clients.push(queryClient);
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
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(
    ({ channel }: { channel: OrderType | undefined }) => useProduct(tenantA, channel),
    {
      initialProps: { channel: 'Takeaway' as OrderType | undefined },
      wrapper,
    },
  );
  return { rendered, queryClient, context, bootstrap, fetcher };
}
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  jest.clearAllMocks();
});
it('does not reuse one order channel verdict for another channel', async () => {
  const { rendered, fetcher } = productHook();
  await waitFor(() => expect(rendered.result.current.product?.availability.canOrder).toBe(true));
  rendered.rerender({ channel: 'Delivery' });
  expect(rendered.result.current.product).toBeUndefined();
  await waitFor(() => expect(rendered.result.current.product?.availability.canOrder).toBe(false));
  rendered.rerender({ channel: 'Takeaway' });
  expect(rendered.result.current.product?.availability.canOrder).toBe(true);
  expect(fetcher.mock.calls.some(([url]) => url.endsWith('requestedOrderType=Delivery'))).toBe(
    true,
  );
  expect(fetcher.mock.calls.some(([url]) => url.endsWith('requestedOrderType=Takeaway'))).toBe(
    true,
  );
});
it('withdraws already cached detail when the restaurant menu capability is disabled', async () => {
  const { rendered, queryClient, context, bootstrap } = productHook();
  await waitFor(() => expect(rendered.result.current.product).toBeDefined());
  await act(async () => {
    queryClient.setQueryData(
      [context.environment, context.tenant.id, 'public', 'bootstrap', 1, context.generation],
      { ...bootstrap, capabilities: { menu: 'disabled' } },
    );
  });
  await waitFor(() => expect(rendered.result.current.product).toBeUndefined());
  expect(rendered.result.current.unavailable).toBe(true);
});
