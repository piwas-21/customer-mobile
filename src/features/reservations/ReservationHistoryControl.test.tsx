import '../../i18n';
import { act, fireEvent } from '@testing-library/react-native';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
import { reservationItem, reservationPage } from '../../test/reservations';
import { response } from '../../test/transport';
import { deferred } from '../../test/deferred';
import {
  reservationHistorySetup as setup,
  reservationEnabled as enabled,
  reservationDisabled as disabled,
} from '../../test/reservationHistory';

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

it('opens on request, reads fresh owned details and removes private cache on close', async () => {
  const f = await setup();
  try {
    expect(f.fetcher).not.toHaveBeenCalled();
    f.open();
    await f.screen.findByText('Nov 1, 2026');
    expect(f.screen.getByText('2 guests')).toBeTruthy();
    expect(f.screen.getByText('Awaiting restaurant confirmation')).toBeTruthy();
    expect(f.screen.getByText('Times shown in America/Los_Angeles.')).toBeTruthy();
    f.fetcher.mockResolvedValueOnce(
      response({
        success: true,
        data: reservationItem(1, {
          status: 'Confirmed',
          specialRequests: 'Quiet corner please',
        }),
      }),
    );
    fireEvent.press(
      f.screen.getByRole('button', { name: 'View reservation for Nov 1, 2026 at 6:30 PM' }),
    );
    await f.screen.findByText('Quiet corner please');
    expect(f.screen.getByText('Confirmed')).toBeTruthy();
    expect(f.screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1);
    expect(f.fetcher.mock.calls[1]?.[0]).toContain(
      '/api/customer-mobile/reservations/' + reservationItem().reservationId,
    );
    fireEvent.press(f.screen.getByRole('button', { name: 'Back to reservations' }));
    await f.screen.findByText('Awaiting restaurant confirmation');
    fireEvent.press(f.screen.getByRole('button', { name: 'Close' }));
    expect(f.cache.getQueryCache().findAll()).toHaveLength(0);
  } finally {
    f.dispose();
  }
});
it('hides retained rows on failed refresh and offers an explicit empty read', async () => {
  const f = await setup();
  try {
    f.open();
    await f.screen.findByText('Nov 1, 2026');
    f.fetcher.mockResolvedValueOnce(response({}, 503));
    fireEvent.press(f.screen.getByRole('button', { name: 'Refresh reservations' }));
    await f.screen.findByText('Your reservations are unavailable. Refresh to check again.');
    expect(f.screen.queryByText('Nov 1, 2026')).toBeNull();
    f.fetcher.mockResolvedValueOnce(response({ success: true, data: reservationPage([]) }));
    fireEvent.press(f.screen.getByRole('button', { name: 'Refresh reservations' }));
    await f.screen.findByText('No reservations are linked to this restaurant account.');
  } finally {
    f.dispose();
  }
});
it.each(['owner', 'capability', 'tenant'] as const)(
  'withdraws an in-flight private result after %s changes',
  async (mode) => {
    const f = await setup();
    const reply = deferred<Response>();
    const entered = deferred<void>();
    f.fetcher.mockImplementationOnce(() => {
      entered.resolve();
      return reply.promise;
    });
    try {
      f.open();
      await act(async () => {
        await entered.promise;
      });
      if (mode === 'owner') {
        f.controller.dispose();
        jest
          .mocked(useSession)
          .mockReturnValue({ ...f.state, userId: null, ownerVersion: f.controller.ownerVersion });
      } else if (mode === 'capability') {
        jest.mocked(useBootstrap).mockReturnValue(disabled);
      } else {
        f.boundary.clear();
        jest.mocked(useRestaurant).mockReturnValue({
          context: undefined,
          client: f.client,
          directory: undefined,
          loading: false,
          select: jest.fn(),
          clear: jest.fn(),
          refresh: jest.fn(),
        });
      }
      f.screen.rerender(f.view());
      await act(async () => {
        reply.resolve(response({ success: true, data: reservationPage() }));
      });
      expect(f.screen.queryByText('Nov 1, 2026')).toBeNull();
      expect(f.cache.getQueryCache().findAll()).toHaveLength(0);
    } finally {
      reply.resolve(response({}, 503));
      f.dispose();
    }
  },
);
it('does not resurrect a capability-withdrawn modal on reactivation', async () => {
  const f = await setup();
  try {
    f.open();
    await f.screen.findByText('Nov 1, 2026');
    jest.mocked(useBootstrap).mockReturnValue(disabled);
    f.screen.rerender(f.view());
    expect(f.cache.getQueryCache().findAll()).toHaveLength(0);
    jest.mocked(useBootstrap).mockReturnValue(enabled);
    f.screen.rerender(f.view());
    expect(f.screen.queryByText('Nov 1, 2026')).toBeNull();
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  } finally {
    f.dispose();
  }
});
it('requires an active customer and a live enabled reservation capability before opening', async () => {
  const f = await setup(false);
  try {
    expect(f.screen.queryByRole('button', { name: 'Your reservations' })).toBeNull();
    expect(f.fetcher).not.toHaveBeenCalled();
  } finally {
    f.dispose();
  }
  const owner = await setup();
  try {
    jest.mocked(useBootstrap).mockReturnValue(disabled);
    owner.screen.rerender(owner.view());
    expect(owner.screen.queryByRole('button', { name: 'Your reservations' })).toBeNull();
    jest.mocked(useBootstrap).mockReturnValue(enabled);
    owner.screen.rerender(owner.view());
    owner.controller.dispose();
    owner.open();
    expect(owner.fetcher).not.toHaveBeenCalled();
  } finally {
    owner.dispose();
  }
});
