import '../../i18n';
import { act, fireEvent, render } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import ReservationAvailabilityScreen from './ReservationAvailabilityScreen';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
import { accountBootstrap } from '../../test/accounts';
import { deferred } from '../../test/deferred';
import { response, setup as transportSetup } from '../../test/transport';
import { tenantB } from '../../test/fixtures';
import type { Bootstrap } from '../../core/capabilities';

jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../restaurant/useBootstrap');
jest.mock('@react-native-community/datetimepicker', () => jest.fn(() => null));
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
const bootstrap = (
  reservations: Bootstrap['capabilities'][string] = 'enabled',
  timezone = 'America/Los_Angeles',
): ReturnType<typeof useBootstrap> => {
  const data: Bootstrap = { ...accountBootstrap.data, timezone, capabilities: { reservations } };
  return { ...accountBootstrap, data } as ReturnType<typeof useBootstrap>;
};
function page(date = '2026-11-01', numberOfGuests = 2, startTime = '18:30:00') {
  return {
    schemaVersion: 1,
    date,
    timeZone: 'America/Los_Angeles',
    numberOfGuests,
    slots: [{ startTime, endTime: '20:30:00' }],
  };
}
function setup() {
  const f = transportSetup();
  const state = {
    context: f.context,
    client: f.client,
    directory: undefined,
    loading: false,
    select: jest.fn(() => true),
    clear: jest.fn(),
    refresh: jest.fn(),
  };
  jest.mocked(useRestaurant).mockReturnValue(state);
  jest.mocked(useBootstrap).mockReturnValue(bootstrap());
  f.fetcher.mockResolvedValue(response({ success: true, data: page() }));
  const screen = render(<ReservationAvailabilityScreen />);
  return {
    ...f,
    state,
    screen,
    check: () => fireEvent.press(screen.getByRole('button', { name: 'Check available times' })),
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-01T08:30:00Z'));
});
afterEach(() => jest.restoreAllMocks());
it('reads only on request without account credentials and hides rows on a failed or empty refresh', async () => {
  const f = setup();
  expect(f.fetcher).not.toHaveBeenCalled();
  f.check();
  await f.screen.findByText('6:30 PM to 8:30 PM');
  expect(f.fetcher.mock.calls[0]?.[1].headers).toEqual({ Accept: 'application/json' });
  f.fetcher.mockResolvedValueOnce(response({}, 503));
  f.check();
  await f.screen.findByText('We could not check availability. Choose another date or try again.');
  expect(f.screen.queryByText('6:30 PM to 8:30 PM')).toBeNull();
  f.fetcher.mockResolvedValueOnce(response({ success: true, data: { ...page(), slots: [] } }));
  f.check();
  await f.screen.findByText('No times are available for this date and party size.');
});
it('withdraws old inputs immediately and cannot let their late result erase a newer successful read', async () => {
  const f = setup();
  const reply = deferred<Response>();
  const entered = deferred<void>();
  f.fetcher.mockImplementationOnce(() => {
    entered.resolve();
    return reply.promise;
  });
  f.check();
  await act(async () => {
    await entered.promise;
  });
  fireEvent.press(f.screen.getByRole('button', { name: 'Increase Number of guests' }));
  f.fetcher.mockResolvedValueOnce(
    response({ success: true, data: page('2026-11-01', 3, '19:00:00') }),
  );
  f.check();
  await f.screen.findByText('7:00 PM to 8:30 PM');
  await act(async () => {
    reply.resolve(response({ success: true, data: page() }));
  });
  expect(f.screen.queryByText('6:30 PM to 8:30 PM')).toBeNull();
  expect(f.screen.getByText('7:00 PM to 8:30 PM')).toBeTruthy();
});
it.each(['capability', 'timezone', 'tenant'] as const)(
  'removes an in-flight result on %s change without reopening it',
  async (mode) => {
    const f = setup();
    const reply = deferred<Response>();
    const entered = deferred<void>();
    f.fetcher.mockImplementationOnce(() => {
      entered.resolve();
      return reply.promise;
    });
    f.check();
    await act(async () => {
      await entered.promise;
    });
    if (mode === 'capability') jest.mocked(useBootstrap).mockReturnValue(bootstrap('disabled'));
    else if (mode === 'timezone')
      jest.mocked(useBootstrap).mockReturnValue(bootstrap('enabled', 'Europe/Zurich'));
    else {
      const context = f.boundary.select(tenantB);
      jest.mocked(useRestaurant).mockReturnValue({ ...f.state, context });
    }
    f.screen.rerender(<ReservationAvailabilityScreen />);
    await act(async () => {
      reply.resolve(response({ success: true, data: page() }));
    });
    expect(f.screen.queryByText('6:30 PM to 8:30 PM')).toBeNull();
    if (mode === 'capability') {
      expect(
        f.screen.getByText('Reservations are unavailable at this restaurant right now.'),
      ).toBeTruthy();
      jest.mocked(useBootstrap).mockReturnValue(bootstrap());
      f.screen.rerender(<ReservationAvailabilityScreen />);
      expect(f.screen.queryByText('6:30 PM to 8:30 PM')).toBeNull();
    }
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  },
);
it('commits a UTC calendar selection explicitly and clears results before checking the new date', async () => {
  const f = setup();
  f.check();
  await f.screen.findByText('6:30 PM to 8:30 PM');
  fireEvent.press(f.screen.getByRole('button', { name: 'Date: Nov 1, 2026' }));
  const picker = jest.mocked(DateTimePicker).mock.calls.at(-1)?.[0];
  expect(picker?.timeZoneName).toBe('UTC');
  expect(picker?.value.toISOString()).toBe('2026-11-01T12:00:00.000Z');
  const value = new Date('2026-11-02T12:00:00Z');
  act(() =>
    picker?.onValueChange?.({ nativeEvent: { timestamp: value.getTime(), utcOffset: 0 } }, value),
  );
  fireEvent.press(f.screen.getByRole('button', { name: 'Use this date' }));
  expect(f.screen.getByRole('button', { name: 'Date: Nov 2, 2026' })).toBeTruthy();
  expect(f.screen.queryByText('6:30 PM to 8:30 PM')).toBeNull();
  f.fetcher.mockResolvedValueOnce(response({ success: true, data: page('2026-11-02') }));
  f.check();
  await f.screen.findByText('6:30 PM to 8:30 PM');
  expect(f.fetcher.mock.calls[1]?.[0]).toContain('date=2026-11-02');
});
it('rechecks the restaurant day after foreground even when no result existed before midnight', () => {
  let change: ((state: AppStateStatus) => void) | undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    change = listener;
    return { remove: jest.fn() };
  });
  const f = setup();
  jest.mocked(Date.now).mockReturnValue(Date.parse('2026-11-02T08:30:00Z'));
  act(() => change?.('active'));
  expect(f.screen.getByText('Choose a current or future date at the restaurant.')).toBeTruthy();
  f.check();
  expect(f.fetcher).not.toHaveBeenCalled();
});
