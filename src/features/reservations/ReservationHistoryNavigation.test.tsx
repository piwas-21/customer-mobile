import '../../i18n';
import { act, fireEvent } from '@testing-library/react-native';
import { useSession } from '../account/SessionProvider';
import useBootstrap from '../restaurant/useBootstrap';
import {
  reservationHistorySetup as setup,
  reservationEnabled as enabled,
  reservationDisabled as disabled,
  reservationBootstrapState,
} from '../../test/reservationHistory';
import { reservationItem, reservationPage } from '../../test/reservations';
import { response } from '../../test/transport';
import { deferred } from '../../test/deferred';

jest.mock('../account/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../restaurant/useBootstrap');
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);

it('pages explicitly with the full non-midnight cursor and returns to the first page', async () => {
  const items = Array.from({ length: 20 }, (_, index) =>
    reservationItem(index + 1, { numberOfGuests: index + 1 }),
  );
  const next = {
    reservationDate: '2026-11-01T09:15:00.123456Z',
    startTime: '18:30:00',
    reservationId: items[19]!.reservationId,
  };
  const f = await setup(true, reservationPage(items, next));
  try {
    f.open();
    await f.screen.findByText('1 guest');
    f.fetcher.mockResolvedValueOnce(
      response({
        success: true,
        data: reservationPage([reservationItem(21, { numberOfGuests: 21 })]),
      }),
    );
    fireEvent.press(f.screen.getByRole('button', { name: 'Next page' }));
    await f.screen.findByText('21 guests');
    expect(f.screen.queryByText('1 guest')).toBeNull();
    const query = new URL(f.fetcher.mock.calls[1]![0]).searchParams;
    expect(query.get('beforeDate')).toBe(next.reservationDate);
    expect(query.get('beforeStartTime')).toBe(next.startTime);
    expect(query.get('beforeId')).toBe(next.reservationId);
    fireEvent.press(f.screen.getByRole('button', { name: 'Previous page' }));
    await f.screen.findByText('1 guest');
    expect(f.fetcher).toHaveBeenCalledTimes(3);
  } finally {
    f.dispose();
  }
});
it.each(['owner', 'capability'] as const)(
  'never restores late private details after %s withdrawal',
  async (mode) => {
    const f = await setup();
    const reply = deferred<Response>();
    const entered = deferred<void>();
    try {
      f.open();
      await f.screen.findByText('Nov 1, 2026');
      f.fetcher.mockImplementationOnce(() => {
        entered.resolve();
        return reply.promise;
      });
      fireEvent.press(
        f.screen.getByRole('button', { name: 'View reservation for Nov 1, 2026 at 6:30 PM' }),
      );
      await act(async () => {
        await entered.promise;
      });
      if (mode === 'owner') {
        f.controller.dispose();
        jest
          .mocked(useSession)
          .mockReturnValue({ ...f.state, userId: null, ownerVersion: f.controller.ownerVersion });
      } else jest.mocked(useBootstrap).mockReturnValue(disabled);
      f.screen.rerender(f.view());
      await act(async () => {
        reply.resolve(
          response({
            success: true,
            data: reservationItem(1, { specialRequests: 'Private late request' }),
          }),
        );
      });
      expect(f.screen.queryByText('Private late request')).toBeNull();
      expect(f.screen.queryByText('Reservation details')).toBeNull();
      expect(f.cache.getQueryCache().findAll()).toHaveLength(0);
    } finally {
      reply.resolve(response({}, 503));
      f.dispose();
    }
  },
);
it.each(['unavailable', 'needsCleanup', 'zone'] as const)(
  'dismisses and purges the private view when %s changes',
  async (mode) => {
    const f = await setup();
    try {
      f.open();
      await f.screen.findByText('Nov 1, 2026');
      if (mode === 'zone')
        jest
          .mocked(useBootstrap)
          .mockReturnValue(reservationBootstrapState('enabled', 'Europe/Paris'));
      else jest.mocked(useSession).mockReturnValue({ ...f.state, [mode]: true });
      f.screen.rerender(f.view());
      expect(f.screen.queryByText('Nov 1, 2026')).toBeNull();
      expect(f.cache.getQueryCache().findAll()).toHaveLength(0);
      jest.mocked(useSession).mockReturnValue(f.state);
      jest.mocked(useBootstrap).mockReturnValue(enabled);
      f.screen.rerender(f.view());
      expect(f.screen.queryByText('Nov 1, 2026')).toBeNull();
    } finally {
      f.dispose();
    }
  },
);
it('shows a clear fallback for unfamiliar statuses and legacy durations without inventing a time', async () => {
  const item = reservationItem(1, {
    numberOfGuests: 1,
    status: 'FutureStatus',
    startTime: '1.01:00:00',
    specialRequests: '   ',
  });
  const f = await setup(true, reservationPage([item]));
  try {
    f.open();
    await f.screen.findByText('Time unavailable');
    expect(f.screen.getByText('Check the latest status with the restaurant.')).toBeTruthy();
    f.fetcher.mockResolvedValueOnce(response({ success: true, data: item }));
    fireEvent.press(
      f.screen.getByRole('button', {
        name: 'View reservation for Nov 1, 2026 at Time unavailable',
      }),
    );
    await f.screen.findByText('Reservation details');
    expect(f.screen.queryByText('Your requests')).toBeNull();
  } finally {
    f.dispose();
  }
});
