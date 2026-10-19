import Button from '../../ui/Button';
import CustomerOrderNotice from './CustomerOrderNotice';
import { secretKey } from '../../core/credentials';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import type { SessionRepository } from '../../core/sessionRepository';
import { useBasket } from './BasketProvider';
import { basketWorkspaceFixture } from '../../test/basketWorkspace';
import { existingBasketSession } from '../../test/basketMutations';
import { basketOperationId, currentBasketOwner } from '../../test/basketOperations';
import { checkoutIntent, appliedOrder } from '../../test/customerOrder';
import { checkoutQuote } from '../../test/checkoutQuote';
import { basketResponse } from '../../test/basketApi';
import { response } from '../../test/transport';
let mockRepository: SessionRepository;
jest.mock('../../storage/sessions', () => ({
  get deviceSessions() {
    return mockRepository;
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../account/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../restaurant/useBootstrap', () => ({ __esModule: true, default: jest.fn() }));
async function configuration() {
  const f = await basketWorkspaceFixture();
  mockRepository = f.repository;
  jest.mocked(randomUUID).mockReturnValue(basketOperationId);
  await existingBasketSession(f);
  f.fetcher.mockImplementation(async (url) =>
    response({
      success: true,
      data: url.endsWith('/prepare')
        ? { schemaVersion: 1, payloadHash: 'c'.repeat(64), quote: checkoutQuote() }
        : { ...basketResponse(), orderType: 'Takeaway' },
    }),
  );
  return f;
}
it.each(['remove', 'readback'] as const)(
  'retains a visible local confirmation check after proof deletion loses its %s acknowledgement',
  async (failure) => {
    const f = await configuration();
    const original = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async (url, options) =>
      url.endsWith('/submit')
        ? response({ success: true, data: appliedOrder() })
        : original(url, options),
    );
    const key = secretKey(f.context, 'order-operation-proof', f.principal);
    const remove = f.store.remove.bind(f.store);
    const get = f.store.get.bind(f.store);
    let deleted = false;
    let failed = false;
    jest.spyOn(f.store, 'remove').mockImplementation(async (name) => {
      await remove(name);
      if (name === key && !failed) {
        deleted = true;
        if (failure === 'remove') {
          failed = true;
          throw new Error('Deletion acknowledgement lost');
        }
      }
    });
    jest.spyOn(f.store, 'get').mockImplementation(async (name) => {
      if (name === key && deleted && failure === 'readback' && !failed) {
        failed = true;
        throw new Error('Deletion readback lost');
      }
      return get(name);
    });
    function Harness() {
      const basket = useBasket();
      return (
        <>
          <CustomerOrderNotice basket={basket} />
          <Button
            label="Place fixture"
            disabled={!basket.canAdd}
            onPress={() => void basket.placeOrder(checkoutIntent()).catch(() => undefined)}
          />
        </>
      );
    }
    const screen = render(<Harness />, { wrapper: f.Wrapper });
    try {
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Place fixture' })).not.toBeDisabled(),
      );
      fireEvent.press(screen.getByRole('button', { name: 'Place fixture' }));
      await waitFor(() =>
        expect(
          screen.getByText('The result is confirmed. Finish saving it on this device.'),
        ).toBeTruthy(),
      );
      expect(screen.queryByRole('button', { name: 'Stop this attempt' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Place fixture' })).toBeDisabled();
      expect(f.store.values.has(key)).toBe(false);
      fireEvent.press(screen.getByRole('button', { name: 'Finish order check' }));
      await waitFor(() =>
        expect(screen.getByText('Your order was received by the restaurant.')).toBeTruthy(),
      );
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Place fixture' })).not.toBeDisabled(),
      );
      expect(
        f.fetcher.mock.calls.filter(([url]) => /checkout\/(submit|recover|cancel)$/.test(url)),
      ).toHaveLength(1);
      expect(
        await f.repository.orders.decisions(f.context, f.principal, currentBasketOwner),
      ).toHaveLength(1);
    } finally {
      screen.unmount();
      f.cache.clear();
    }
  },
);
