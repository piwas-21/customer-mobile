import '../i18n';
import { bootstrapSchema } from '../core/capabilities';
import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BasketProvider from '../features/basket/BasketProvider';
import { useRestaurant } from '../features/restaurant/RestaurantProvider';
import { useSession } from '../features/account/SessionProvider';
import useBootstrap from '../features/restaurant/useBootstrap';
import { basketControllerFixture } from './basketController';
export async function basketWorkspaceFixture(customer = false) {
  const f = await basketControllerFixture(customer);
  const cache = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  const state = {
    controller: f.sessions,
    userId: f.sessions.userId,
    ownerVersion: f.sessions.ownerVersion,
    needsCleanup: false,
    loading: false,
    unavailable: false,
    failed: false,
    retry: jest.fn(),
  };
  jest.mocked(useSession).mockReturnValue(state);
  jest.mocked(useRestaurant).mockReturnValue({
    context: f.context,
    client: f.client,
    directory: undefined,
    loading: false,
    select: jest.fn(),
    clear: jest.fn(),
    refresh: jest.fn(),
  });
  jest
    .mocked(useBootstrap)
    .mockReturnValue({ data: bootstrapSchema.parse(f.bootstrap), isPending: false } as ReturnType<
      typeof useBootstrap
    >);
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={cache}>
        <BasketProvider>{children}</BasketProvider>
      </QueryClientProvider>
    );
  }
  return { ...f, cache, state, Wrapper };
}
