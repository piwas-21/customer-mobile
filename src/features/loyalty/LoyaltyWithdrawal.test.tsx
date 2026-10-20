import '../../i18n';
import { act } from '@testing-library/react-native';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
import { loyaltyBalance, loyaltyPage } from '../../test/loyalty';
import { response } from '../../test/transport';
import { deferred } from '../../test/deferred';
import {
  loyaltyHistorySetup as setup,
  loyaltyEnabled as enabled,
  loyaltyDisabled as disabled,
} from '../../test/loyaltyHistory';

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
it.each(['owner', 'capability', 'tenant', 'currency', 'zone'] as const)(
  'withdraws late private history on %s changes',
  async (change) => {
    const f = await setup();
    expect(enabled.data!.currency).not.toBe('CHF');
    const reply = deferred<Response>();
    const entered = deferred<void>();
    f.fetcher.mockImplementation(async (url) => {
      if (url.includes('/balance?')) return response({ success: true, data: loyaltyBalance });
      entered.resolve();
      return reply.promise;
    });
    try {
      f.open();
      await act(async () => {
        await entered.promise;
      });
      if (change === 'owner') {
        f.controller.dispose();
        jest
          .mocked(useSession)
          .mockReturnValue({ ...f.state, userId: null, ownerVersion: f.controller.ownerVersion });
      } else if (change === 'capability') jest.mocked(useBootstrap).mockReturnValue(disabled);
      else if (change === 'tenant') {
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
      } else
        jest.mocked(useBootstrap).mockReturnValue({
          ...enabled,
          data: {
            ...enabled.data!,
            ...(change === 'currency' ? { currency: 'CHF' } : { timezone: 'UTC' }),
          },
        } as ReturnType<typeof useBootstrap>);
      f.screen.rerender(f.view());
      await act(async () => {
        reply.resolve(response({ success: true, data: loyaltyPage() }));
      });
      expect(f.screen.queryByText('Adjustment: -1 points')).toBeNull();
      expect(f.screen.queryByText('415 recorded points')).toBeNull();
      expect(f.cache.getQueryCache().findAll()).toHaveLength(0);
    } finally {
      reply.resolve(response({}, 503));
      f.dispose();
    }
  },
);
it('requires a fresh explicit open after capability returns and refuses guest or disposed-customer access', async () => {
  const guest = await setup(false);
  expect(guest.screen.queryByRole('button', { name: 'Your points' })).toBeNull();
  expect(guest.fetcher).not.toHaveBeenCalled();
  guest.dispose();
  const f = await setup();
  try {
    f.open();
    await f.screen.findByText('415 recorded points');
    jest.mocked(useBootstrap).mockReturnValue(disabled);
    f.screen.rerender(f.view());
    jest.mocked(useBootstrap).mockReturnValue(enabled);
    f.screen.rerender(f.view());
    expect(f.screen.queryByText('415 recorded points')).toBeNull();
    expect(f.cache.getQueryCache().findAll()).toHaveLength(0);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    f.controller.dispose();
    f.open();
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  } finally {
    f.dispose();
  }
});
it.each(['cleanup', 'unavailable', 'zone', 'currency', 'compatibility'] as const)(
  'refuses an unavailable %s context before private I/O',
  async (missing) => {
    const f = await setup();
    try {
      if (missing === 'cleanup' || missing === 'unavailable')
        jest.mocked(useSession).mockReturnValue({
          ...f.state,
          needsCleanup: missing === 'cleanup',
          unavailable: missing === 'unavailable',
        });
      else
        jest.mocked(useBootstrap).mockReturnValue({
          ...enabled,
          data: {
            ...enabled.data!,
            ...(missing === 'zone'
              ? { timezone: '' }
              : missing === 'currency'
                ? { currency: null }
                : { compatibility: 'unavailable' }),
          },
        } as ReturnType<typeof useBootstrap>);
      f.screen.rerender(f.view());
      expect(f.screen.queryByRole('button', { name: 'Your points' })).toBeNull();
      expect(f.fetcher).not.toHaveBeenCalled();
    } finally {
      f.dispose();
    }
  },
);
