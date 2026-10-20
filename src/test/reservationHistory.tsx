import '../i18n';
import { fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSession } from '../features/account/SessionProvider';
import { useRestaurant } from '../features/restaurant/RestaurantProvider';
import useBootstrap from '../features/restaurant/useBootstrap';
import { accountBootstrap } from './accounts';
import { sessionSetup } from './sessions';
import { reservationPage } from './reservations';
import { response } from './transport';
import ReservationHistoryControl from '../features/reservations/ReservationHistoryControl';
import type { Bootstrap } from '../core/capabilities';

export function reservationBootstrapState(
  reservations: Bootstrap['capabilities'][string] = 'enabled',
  timezone = 'America/Los_Angeles',
): ReturnType<typeof useBootstrap> {
  const data: Bootstrap = {
    ...accountBootstrap.data,
    timezone,
    capabilities: { accounts: 'enabled', reservations },
  };
  return { ...accountBootstrap, data } as ReturnType<typeof useBootstrap>;
}
export const reservationEnabled = reservationBootstrapState();
export const reservationDisabled = reservationBootstrapState('disabled');
export async function reservationHistorySetup(customer = true, data = reservationPage()) {
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
  jest.mocked(useBootstrap).mockReturnValue(reservationEnabled);
  f.fetcher.mockResolvedValue(response({ success: true, data }));
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = () => (
    <QueryClientProvider client={cache}>
      <ReservationHistoryControl />
    </QueryClientProvider>
  );
  const screen = render(view());
  return {
    ...f,
    state,
    cache,
    screen,
    view,
    open: () => fireEvent.press(screen.getByRole('button', { name: 'Your reservations' })),
    dispose: () => {
      screen.unmount();
      cache.clear();
    },
  };
}
