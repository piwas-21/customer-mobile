import { useEffect } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import SessionProvider, { useSession } from '../account/SessionProvider';
import BasketProvider, { useBasket } from './BasketProvider';
import CustomerOrderNotice from './CustomerOrderNotice';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
import {
  accountFixture,
  accountStore,
  accountRepository,
  accountBootstrap,
} from '../../test/accounts';
import {
  basketSessionId,
  basketOperationId,
  currentBasketOwner,
} from '../../test/basketOperations';
import { appliedOrder, checkoutIntent } from '../../test/customerOrder';
import { session } from '../../test/sessions';
import { response } from '../../test/transport';
import { directoryInput, tenantA } from '../../test/fixtures';
import { parseDirectory } from '../../core/directory';
import { TenantBoundary } from '../../core/tenantContext';
import { CustomerTransport } from '../../core/transport';
import { z } from 'zod';
let observed: ReturnType<typeof useBasket>;
let owner: ReturnType<typeof useSession>;
jest.mock('../../storage/sessions', () => ({
  deviceSessions:
    jest.requireActual<typeof import('../../test/accounts')>('../../test/accounts')
      .accountRepository,
}));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../restaurant/useBootstrap', () => ({ __esModule: true, default: jest.fn() }));
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
beforeEach(() => {
  accountStore.values.clear();
  jest.restoreAllMocks();
});
function Probe() {
  const basket = useBasket();
  const sessionState = useSession();
  useEffect(() => {
    observed = basket;
    owner = sessionState;
  }, [basket, sessionState]);
  return (
    <>
      <CustomerOrderNotice basket={basket} />
      <Text>{basket.canAdd ? 'new-allowed' : 'new-blocked'}</Text>
    </>
  );
}
it.each([
  'guest-disabled',
  'guest-read-only',
  'customer-disabled',
  'customer-ordering-enabled',
  'customer-ordering-enabled-cleanup',
] as const)(
  'keeps original order recovery reachable after %s capability withdrawal without enabling purchases',
  async (scenario) => {
    const customer = scenario.startsWith('customer');
    const f = accountFixture();
    const principal = customer
      ? { kind: 'customer' as const, id: session.userId }
      : { kind: 'guest' as const, id: 'basket' };
    // A different saved customer is deliberately present for guest-only ordering.
    await accountRepository.activate(f.context, session, () => true);
    const sessionRead = jest.spyOn(accountRepository.vault, 'session');
    await accountRepository.vault.saveCapability(
      f.context,
      'guest-session',
      principal,
      basketSessionId,
    );
    await accountRepository.orders.prepare(
      f.context,
      principal,
      { intent: checkoutIntent(), payloadHash: 'c'.repeat(64) },
      () => basketOperationId,
      currentBasketOwner,
    );
    let state = f.state;
    jest.mocked(useRestaurant).mockImplementation(() => state);
    const initial = {
      ...accountBootstrap.data,
      capabilities: {
        accounts: customer ? ('enabled' as const) : ('disabled' as const),
        ordering: 'enabled' as const,
      },
    };
    jest
      .mocked(useBootstrap)
      .mockReturnValue({ data: initial, isPending: false } as unknown as ReturnType<
        typeof useBootstrap
      >);
    f.fetcher.mockImplementation(async (url) => {
      if (url.endsWith('/recover'))
        return response({
          success: true,
          data: { ...appliedOrder(), outcome: 'Unseen', orderId: null },
        });
      if (url.endsWith('/cancel'))
        return response({
          success: true,
          data: { ...appliedOrder(), outcome: 'Cancelled', orderId: null },
        });
      throw new Error('New request is forbidden');
    });
    function Wrapper() {
      return (
        <QueryClientProvider client={f.queryClient}>
          <SessionProvider>
            <BasketProvider>
              <Probe />
            </BasketProvider>
          </SessionProvider>
        </QueryClientProvider>
      );
    }
    const screen = render(<Wrapper />);
    try {
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Check earlier order' })).toBeTruthy(),
      );
      const oldOwner = owner.controller!;
      f.fetcher.mockClear();
      const lifecycle =
        scenario === 'guest-read-only' ? ('read-only' as const) : ('active' as const);
      if (lifecycle === 'read-only') {
        const input = directoryInput();
        input.tenants[0]!.status = 'read-only';
        const boundary = new TenantBoundary(parseDirectory(input, 'staging'));
        state = {
          ...state,
          context: boundary.select(tenantA),
          client: new CustomerTransport(boundary, accountRepository.vault, f.fetcher),
        };
      }
      jest.mocked(useBootstrap).mockReturnValue({
        data: {
          ...initial,
          lifecycle,
          capabilities: {
            accounts: 'disabled',
            ordering: scenario.startsWith('customer-ordering-enabled') ? 'enabled' : 'disabled',
          },
        },
        isPending: false,
      } as unknown as ReturnType<typeof useBootstrap>);
      screen.rerender(<Wrapper />);
      await waitFor(() => expect(owner.controller).toBeDefined());
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Check earlier order' })).toBeTruthy(),
      );
      expect(() => oldOwner.captureRequestOwner(principal)).toThrow();
      expect(screen.getByText('new-blocked')).toBeTruthy();
      expect(owner.unavailable).toBe(true);
      expect(owner.userId).toBe(customer ? session.userId : null);
      if (!customer) expect(sessionRead).not.toHaveBeenCalled();
      await expect(
        owner.controller!.login({ email: 'fixture@example.test', password: 'password' }, 'en'),
      ).rejects.toMatchObject({ status: 401 });
      if (customer)
        await expect(
          owner.controller!.get(session.userId, '/api/user/profile', z.unknown()),
        ).rejects.toMatchObject({ status: 401 });
      await expect(observed.placeOrder(checkoutIntent())).rejects.toMatchObject({ status: 409 });
      await act(async () =>
        fireEvent.press(screen.getByRole('button', { name: 'Check earlier order' })),
      );
      await waitFor(() => expect(observed.orderDecision?.outcome).toBe('Unseen'));
      expect(screen.getByRole('button', { name: 'Check earlier order' })).toBeTruthy();
      fireEvent.press(screen.getByRole('button', { name: 'Stop this attempt' }));
      fireEvent.press(screen.getByRole('button', { name: 'Stop if not received and check' }));
      await waitFor(() => expect(screen.getByText(/This attempt was stopped/)).toBeTruthy());
      expect(f.fetcher.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
        '/api/customer-mobile/checkout/recover',
        '/api/customer-mobile/checkout/cancel',
      ]);
      for (const [, options] of f.fetcher.mock.calls) {
        expect(options.headers?.['X-Session-Id']).toBe(basketSessionId);
        if (customer) expect(options.headers?.Authorization).toBe(`Bearer ${session.accessToken}`);
        else expect(options.headers).not.toHaveProperty('Authorization');
      }
      expect(observed.canAdd).toBe(false);
      if (scenario.startsWith('customer-ordering-enabled')) {
        if (scenario.endsWith('-cleanup')) {
          const remove = accountStore.remove.bind(accountStore);
          let fail = true;
          jest.spyOn(accountStore, 'remove').mockImplementation(async (name) => {
            if (name.endsWith('.session') && fail) {
              fail = false;
              throw new Error('Credential cleanup unavailable');
            }
            await remove(name);
          });
        }
        fireEvent.press(screen.getByRole('button', { name: 'Sign out and continue as guest' }));
        if (scenario.endsWith('-cleanup')) {
          await waitFor(() =>
            expect(
              screen.getByText(
                'Sign-out could not be completed on this device. Please try again before leaving it.',
              ),
            ).toBeTruthy(),
          );
          expect(observed.canAdd).toBe(false);
          fireEvent.press(screen.getByRole('button', { name: 'Sign out and continue as guest' }));
        }
        await waitFor(() => expect(screen.getByText('new-allowed')).toBeTruthy());
        expect(owner.userId).toBeNull();
        expect(owner.unavailable).toBe(true);
        expect(await accountRepository.vault.session(state.context, session.userId)).toBeNull();
      }
    } finally {
      screen.unmount();
      f.queryClient.clear();
    }
  },
);
