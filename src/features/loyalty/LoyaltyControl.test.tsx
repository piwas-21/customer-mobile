import '../../i18n';
import { fireEvent } from '@testing-library/react-native';
import { loyaltyBalance, loyaltyMovement, loyaltyPage } from '../../test/loyalty';
import { response } from '../../test/transport';
import { loyaltyHistorySetup as setup } from '../../test/loyaltyHistory';

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
it('reads only on explicit open, shows recorded points and ledger, and clears both private queries on close', async () => {
  const f = await setup();
  try {
    expect(f.fetcher).not.toHaveBeenCalled();
    f.open();
    await f.screen.findByText('415 recorded points');
    await f.screen.findByText('Adjustment: -1 points');
    expect(f.screen.getByText('Total earned: 700')).toBeTruthy();
    expect(f.screen.getByText('Total redeemed: 285')).toBeTruthy();
    expect(
      f.screen.getByText('Your available points and discounts are confirmed at checkout.'),
    ).toBeTruthy();
    expect(f.screen.getByText('Times shown in America/Los_Angeles.')).toBeTruthy();
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    fireEvent.press(f.screen.getByRole('button', { name: 'Close' }));
    expect(f.cache.getQueryCache().findAll()).toHaveLength(0);
  } finally {
    f.dispose();
  }
});
it('hides retained points and ledger on refused refresh, then supports empty activity and a new-account balance', async () => {
  const f = await setup();
  try {
    f.open();
    await f.screen.findByText('415 recorded points');
    await f.screen.findByText('Adjustment: -1 points');
    f.fetcher.mockResolvedValue(response({}, 503));
    fireEvent.press(f.screen.getByRole('button', { name: 'Refresh points' }));
    await f.screen.findAllByText('Your points are unavailable. Refresh to check again.');
    expect(f.screen.queryByText('415 recorded points')).toBeNull();
    expect(f.screen.queryByText('Adjustment: -1 points')).toBeNull();
    f.fetcher.mockImplementation(async (url) =>
      response({
        success: true,
        data: url.includes('/balance?')
          ? {
              schemaVersion: 1,
              currentPoints: 0,
              totalEarnedPoints: 0,
              totalRedeemedPoints: 0,
              lastUpdated: null,
            }
          : loyaltyPage([]),
      }),
    );
    fireEvent.press(f.screen.getByRole('button', { name: 'Refresh points' }));
    await f.screen.findByText('0 recorded points');
    await f.screen.findByText('No points activity is linked to this restaurant account.');
  } finally {
    f.dispose();
  }
});
it('follows exact ledger cursors and supports return to the previous page without an offset', async () => {
  const f = await setup();
  const items = Array.from({ length: 20 }, (_, i) => loyaltyMovement(i + 1));
  const next = { createdAt: items[19]!.createdAt, transactionId: items[19]!.transactionId };
  f.fetcher.mockImplementation(async (url) =>
    response({
      success: true,
      data: url.includes('/balance?')
        ? loyaltyBalance
        : new URL(url).searchParams.has('beforeId')
          ? loyaltyPage([loyaltyMovement(21)])
          : { ...loyaltyPage(items), next },
    }),
  );
  try {
    f.open();
    await f.screen.findByText('Adjustment: -1 points');
    fireEvent.press(f.screen.getByRole('button', { name: 'Next points page' }));
    await f.screen.findByText('Adjustment: -21 points');
    const url = f.fetcher.mock.calls.map(([url]) => url).find((url) => url.includes('beforeId='))!;
    expect(new URL(url).searchParams.get('beforeCreatedAt')).toBe('2026-11-01T09:15:00.1234567Z');
    expect(new URL(url).searchParams.get('beforeId')).toBe(next.transactionId);
    fireEvent.press(f.screen.getByRole('button', { name: 'Previous points page' }));
    await f.screen.findByText('Adjustment: -1 points');
  } finally {
    f.dispose();
  }
});

it('presents restored points and expiry in the restaurant timezone without a currency promise', async () => {
  const f = await setup();
  f.fetcher.mockImplementation(async (url) =>
    response({
      success: true,
      data: url.includes('/balance?')
        ? loyaltyBalance
        : {
            schemaVersion: 1,
            items: [
              {
                ...loyaltyMovement(),
                kind: 'redemption-restored',
                points: 52,
                expiresAt: '2026-11-21T09:15:00Z',
              },
            ],
            next: null,
          },
    }),
  );
  try {
    f.open();
    await f.screen.findByText('Redeemed points restored: +52 points');
    expect(f.screen.getByText('Expires Nov 21, 2026, 1:15 AM')).toBeTruthy();
    expect(f.screen.getByText('Nov 1, 2026, 1:15 AM')).toBeTruthy();
  } finally {
    f.dispose();
  }
});
