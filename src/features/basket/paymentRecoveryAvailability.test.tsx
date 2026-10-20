import { useEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import SessionProvider, { useSession } from '../account/SessionProvider';
import BasketProvider, { useBasket } from './BasketProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
import {
  accountFixture,
  accountStore,
  accountRepository,
  accountBootstrap,
} from '../../test/accounts';
import {
  basketOperationId,
  basketSessionId,
  currentBasketOwner,
} from '../../test/basketOperations';
import { checkoutIntent, appliedOrder } from '../../test/customerOrder';
import { session } from '../../test/sessions';
import { response } from '../../test/transport';
import { PaymentOperationStorage } from '../../core/paymentOperationStorage';
let basket: ReturnType<typeof useBasket>;
let owner: ReturnType<typeof useSession>;
jest.mock('../../storage/sessions', () => ({
  deviceSessions:
    jest.requireActual<typeof import('../../test/accounts')>('../../test/accounts')
      .accountRepository,
}));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../restaurant/useBootstrap', () => ({ __esModule: true, default: jest.fn() }));
function Probe() {
  const current = useBasket();
  const currentSession = useSession();
  useEffect(() => {
    basket = current;
    owner = currentSession;
  }, [current, currentSession]);
  return null;
}
beforeEach(() => {
  accountStore.values.clear();
  jest.restoreAllMocks();
});
it.each(['pending', 'late-pending'] as const)(
  'blocks guest continuation with %s original payment even after Applied order proof clears',
  async (scenario) => {
    const f = accountFixture();
    const principal = { kind: 'customer' as const, id: session.userId };
    await accountRepository.activate(f.context, session, () => true);
    await accountRepository.vault.saveCapability(
      f.context,
      'guest-session',
      principal,
      basketSessionId,
    );
    const proof = await accountRepository.orders.prepare(
      f.context,
      principal,
      {
        intent: {
          ...checkoutIntent(),
          paymentMethod: scenario === 'pending' ? 'OnlinePayment' : 'Cash',
        },
        payloadHash: 'c'.repeat(64),
      },
      () => basketOperationId,
      currentBasketOwner,
    );
    jest.mocked(useRestaurant).mockReturnValue(f.state);
    jest.mocked(useBootstrap).mockReturnValue({
      data: {
        ...accountBootstrap.data,
        capabilities: { accounts: 'disabled', ordering: 'enabled' },
      },
      isPending: false,
    } as unknown as ReturnType<typeof useBootstrap>);
    f.fetcher.mockResolvedValue(response({ success: true, data: appliedOrder() }));
    const view = render(
      <QueryClientProvider client={f.queryClient}>
        <SessionProvider>
          <BasketProvider>
            <Probe />
          </BasketProvider>
        </SessionProvider>
      </QueryClientProvider>,
    );
    try {
      await waitFor(() => expect(basket.pendingOrder).toBeTruthy());
      await act(async () => {
        await basket.recoverOrder();
      });
      await waitFor(() => expect(basket.orderDecision?.outcome).toBe('Applied'));
      expect(
        await accountRepository.orders.load(f.context, principal, currentBasketOwner),
      ).toBeNull();
      if (scenario === 'late-pending') {
        await waitFor(() => expect(basket.canContinueAsGuest).toBe(true));
        // Hostile state is installed directly, independently of the continuation under test.
        const { intent: omittedIntent, ...original } = proof;
        expect(omittedIntent.paymentMethod).toBe('Cash');
        await new PaymentOperationStorage(accountStore).accept(
          f.context,
          { ...original, onlinePayment: true },
          appliedOrder().orderId,
          currentBasketOwner,
        );
      } else {
        await waitFor(() => expect(basket.canContinueAsGuest).toBe(false));
      }
      await act(async () => {
        await expect(basket.continueAsGuest()).rejects.toMatchObject({ status: 409 });
      });
      expect(owner.userId).toBe(session.userId);
      expect(await accountRepository.load(f.context)).toEqual(session);
      expect(
        (await accountRepository.payments.load(f.context, principal, currentBasketOwner))?.state,
      ).toBe('pending');
    } finally {
      view.unmount();
      f.queryClient.clear();
    }
  },
);
