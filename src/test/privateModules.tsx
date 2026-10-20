import type { ComponentType } from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSession } from '../features/account/SessionProvider';
import { useRestaurant } from '../features/restaurant/RestaurantProvider';
import useBootstrap from '../features/restaurant/useBootstrap';
import { sessionSetup } from './sessions';

export async function privateModuleSetup(
  Control: ComponentType,
  bootstrap: ReturnType<typeof useBootstrap>,
  customer = true,
) {
  const f = await sessionSetup(customer);
  const state = {
    controller: f.controller,
    userId: f.controller.userId,
    ownerVersion: f.controller.ownerVersion,
    unavailable: false,
    needsCleanup: false,
    needsPaymentAttention: false,
    loading: false,
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
  jest.mocked(useBootstrap).mockReturnValue(bootstrap);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = () => (
    <QueryClientProvider client={cache}>
      <Control />
    </QueryClientProvider>
  );
  const screen = render(view());
  return {
    ...f,
    state,
    cache,
    screen,
    view,
    dispose: () => {
      screen.unmount();
      cache.clear();
    },
  };
}
