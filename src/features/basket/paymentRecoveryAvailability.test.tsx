import PaymentAttentionNotice from '../payments/PaymentAttentionNotice';
import { basketResponse } from '../../test/basketApi';
import { useEffect } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
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
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
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

it('keeps the pending warning and blocks automatic guest purchasing after rejected refresh', async () => {
  const f = accountFixture();
  const principal = { kind: 'customer', id: session.userId } as const;
  await accountRepository.activate(f.context, session, () => true);
  await accountRepository.vault.saveCapability(
    f.context,
    'guest-session',
    principal,
    basketSessionId,
  );
  await accountRepository.orders.prepare(
    f.context,
    principal,
    {
      intent: { ...checkoutIntent(), paymentMethod: 'OnlinePayment' },
      payloadHash: 'c'.repeat(64),
    },
    () => basketOperationId,
    currentBasketOwner,
  );
  await accountRepository.orders.finish(f.context, principal, appliedOrder(), currentBasketOwner);
  const record = (await accountRepository.payments.load(f.context, principal, currentBasketOwner))!;
  jest.mocked(useRestaurant).mockReturnValue(f.state);
  jest.mocked(useBootstrap).mockReturnValue({
    ...accountBootstrap,
    data: {
      ...accountBootstrap.data,
      capabilities: { accounts: 'enabled', ordering: 'enabled' },
    },
  } as unknown as ReturnType<typeof useBootstrap>);
  f.fetcher.mockResolvedValue(response({}, 401));
  const view = render(
    <QueryClientProvider client={f.queryClient}>
      <SessionProvider>
        <BasketProvider>
          <Probe />
          <PaymentAttentionNotice />
        </BasketProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  try {
    await waitFor(() => expect(owner.controller).toBeTruthy());
    await act(async () => {
      await expect(owner.controller!.orders.payment(record, 'en')).rejects.toMatchObject({
        status: 401,
      });
    });
    await waitFor(() => expect(owner.needsPaymentAttention).toBe(true));
    expect(owner.userId).toBeNull();
    expect(basket.canAdd).toBe(false);
    expect(
      view.getByText(/An earlier order, payment or cancellation needs confirmation/),
    ).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Use this device for another customer' }));
    expect(
      view.getByText(/The previous customer’s order, payment or cancellation may still complete/),
    ).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Keep the original order reminder' }));
    expect(owner.needsPaymentAttention).toBe(true);
    expect(basket.canAdd).toBe(false);
    fireEvent.press(view.getByRole('button', { name: 'Use this device for another customer' }));
    f.fetcher.mockResolvedValue(response({ success: true, data: basketResponse() }));
    fireEvent.press(view.getByRole('button', { name: 'Continue for another customer' }));
    await waitFor(() => expect(owner.needsPaymentAttention).toBe(false));
    await waitFor(() => expect(basket.canAdd).toBe(true));
    expect(await accountRepository.payments.load(f.context, principal, currentBasketOwner)).toEqual(
      record,
    );
  } finally {
    view.unmount();
    f.queryClient.clear();
  }
});
