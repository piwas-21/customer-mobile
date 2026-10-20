import '../i18n';
import type { ProductDetail } from '../api/productDetail';
import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import ProductScreen from '../features/menu/ProductScreen';
import { useRestaurant } from '../features/restaurant/RestaurantProvider';
import { useSession } from '../features/account/SessionProvider';
import { useBasket } from '../features/basket/BasketProvider';
import { basketControllerFixture } from './basketController';
import { compositionProduct } from './compositions';
import { response } from './transport';
import { routerFixture } from './router';
import { basketState } from './basketState';
export async function productJourneyFixture(product: ProductDetail = compositionProduct()) {
  const f = await basketControllerFixture();
  const bootstrap = { ...f.bootstrap, capabilities: { menu: 'enabled', ordering: 'enabled' } };
  f.fetcher.mockImplementation(async (url) =>
    response({ success: true, data: url.includes('bootstrap') ? bootstrap : product }),
  );
  const cache = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } },
  });
  jest.mocked(useRestaurant).mockReturnValue({
    context: f.context,
    client: f.client,
    directory: undefined,
    loading: false,
    clear: jest.fn(),
    refresh: jest.fn(),
    select: jest.fn(),
  });
  const owner = {
    controller: f.sessions,
    userId: null,
    ownerVersion: f.sessions.ownerVersion,
    needsCleanup: false,
    needsPaymentAttention: false,
    loading: false,
    unavailable: false,
    failed: false,
    retry: jest.fn(),
  };
  jest.mocked(useSession).mockReturnValue(owner);
  const basket = basketState();
  jest.mocked(useBasket).mockReturnValue(basket);
  const router = routerFixture();
  jest.mocked(useRouter).mockReturnValue(router);
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: product.id });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={cache}>{children}</QueryClientProvider>;
  }
  const screen = render(<ProductScreen />, { wrapper: Wrapper });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy());
  const review = () => {
    let next = screen.queryByRole('button', { name: 'Next' });
    let steps = 0;
    while (next && steps++ < 10) {
      fireEvent.press(next);
      next = screen.queryByRole('button', { name: 'Next' });
    }
    expect(screen.getByRole('button', { name: 'Add to basket' })).toBeTruthy();
  };
  return {
    ...f,
    cache,
    product,
    owner,
    basket,
    router,
    screen,
    review,
    close() {
      screen.unmount();
      cache.clear();
    },
  };
}
