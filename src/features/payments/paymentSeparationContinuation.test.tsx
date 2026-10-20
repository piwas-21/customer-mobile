import { useEffect } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
import PaymentAttentionNotice from './PaymentAttentionNotice';
import {
  accountFixture,
  accountStore,
  accountRepository,
  accountBootstrap,
} from '../../test/accounts';
import { basketOperationId, basketSessionId } from '../../test/basketOperations';
import { checkoutIntent, appliedOrder } from '../../test/customerOrder';
import { session } from '../../test/sessions';
import { response } from '../../test/transport';
import { deferred } from '../../test/deferred';
jest.mock('../../storage/sessions', () => ({
  deviceSessions:
    jest.requireActual<typeof import('../../test/accounts')>('../../test/accounts')
      .accountRepository,
}));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../restaurant/useBootstrap', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
let owner: ReturnType<typeof useSession>;
function Probe() {
  const current = useSession();
  useEffect(() => {
    owner = current;
  }, [current]);
  return null;
}
it('keeps real confirmed separation busy across its synchronous owner revision and paused SecureStore removal', async () => {
  accountStore.values.clear();
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
    () => {},
  );
  await accountRepository.orders.finish(f.context, principal, appliedOrder(), () => {});
  const record = (await accountRepository.payments.load(f.context, principal, () => {}))!;
  jest.mocked(useRestaurant).mockReturnValue(f.state);
  jest.mocked(useBootstrap).mockReturnValue(accountBootstrap as ReturnType<typeof useBootstrap>);
  f.fetcher.mockResolvedValue(response({}, 401));
  const view = render(
    <f.Wrapper>
      <Probe />
      <PaymentAttentionNotice />
    </f.Wrapper>,
  );
  const entered = deferred<void>();
  const release = deferred<void>();
  let removal: jest.SpyInstance | undefined;
  try {
    await waitFor(() => expect(owner.controller).toBeTruthy());
    await act(async () => {
      await expect(owner.controller!.orders.payment(record, 'en')).rejects.toThrow();
    });
    await waitFor(() => expect(owner.needsPaymentAttention).toBe(true));
    const version = owner.ownerVersion;
    const separate = jest.spyOn(owner.controller!, 'continueForAnotherCustomer');
    const remove = accountStore.remove;
    removal = jest.spyOn(accountStore, 'remove').mockImplementation(async (key) => {
      if (key.endsWith('.payment-attention')) {
        entered.resolve();
        await release.promise;
      }
      await remove(key);
    });
    fireEvent.press(view.getByRole('button', { name: 'Use this device for another customer' }));
    fireEvent.press(view.getByRole('button', { name: 'Continue for another customer' }));
    await act(async () => {
      await entered.promise;
    });
    expect(owner.ownerVersion).not.toBe(version);
    expect(
      view.getByRole('button', { name: 'Use this device for another customer' }).props
        .accessibilityState.disabled,
    ).toBe(true);
    fireEvent.press(view.getByRole('button', { name: 'Use this device for another customer' }));
    expect(view.queryByRole('button', { name: 'Continue for another customer' })).toBeNull();
    expect(separate).toHaveBeenCalledTimes(1);
    await act(async () => {
      release.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(owner.needsPaymentAttention).toBe(false));
    expect(await accountRepository.payments.load(f.context, principal, () => {})).toEqual(record);
  } finally {
    release.resolve();
    removal?.mockRestore();
    view.unmount();
    f.queryClient.clear();
  }
});
