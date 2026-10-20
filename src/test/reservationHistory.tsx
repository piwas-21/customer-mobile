import '../i18n';
import { fireEvent } from '@testing-library/react-native';
import useBootstrap from '../features/restaurant/useBootstrap';
import { accountBootstrap } from './accounts';
import { privateModuleSetup } from './privateModules';
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
  const f = await privateModuleSetup(ReservationHistoryControl, reservationEnabled, customer);
  f.fetcher.mockResolvedValue(response({ success: true, data }));
  return {
    ...f,
    open: () => fireEvent.press(f.screen.getByRole('button', { name: 'Your reservations' })),
  };
}
