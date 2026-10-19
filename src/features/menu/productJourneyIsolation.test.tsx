import { act, fireEvent, waitFor } from '@testing-library/react-native';
import ProductScreen from './ProductScreen';
import { useSession } from '../account/SessionProvider';
import { useBasket } from '../basket/BasketProvider';
import { SessionController } from '../../core/sessionController';
import productQueryKey from './productQueryKey';
import { productJourneyFixture } from '../../test/productJourney';
import { response } from '../../test/transport';
jest.mock('../basket/BasketProvider', () => ({ useBasket: jest.fn() }));
jest.mock('../account/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(),
  Stack: { Screen: () => null },
}));
beforeEach(() => jest.useFakeTimers());
afterEach(async () => {
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
});
it.each(['revision', 'controller'] as const)(
  'withdraws a private draft when the owner %s changes',
  async (change) => {
    const f = await productJourneyFixture();
    try {
      f.review();
      fireEvent.changeText(
        f.screen.getByLabelText('Instructions for the kitchen (optional)'),
        'Private kitchen note',
      );
      const controller =
        change === 'controller'
          ? new SessionController(f.context, f.client, f.repository)
          : f.sessions;
      if (controller !== f.sessions) await controller.initialize();
      jest.mocked(useSession).mockReturnValue({
        ...f.owner,
        controller,
        ownerVersion: change === 'revision' ? '1:true' : f.owner.ownerVersion,
      });
      f.screen.rerender(<ProductScreen />);
      expect(f.screen.queryByRole('button', { name: 'Add to basket' })).toBeNull();
      expect(f.screen.getByRole('button', { name: 'Next' })).toBeTruthy();
      f.review();
      expect(f.screen.getByLabelText('Instructions for the kitchen (optional)')).toHaveProp(
        'value',
        '',
      );
      expect(f.basket.add).not.toHaveBeenCalled();
    } finally {
      f.close();
    }
  },
);
it('does not navigate from an accepted old draft after its owner changes', async () => {
  const f = await productJourneyFixture();
  let release!: () => void;
  const accepted = new Promise<void>((resolve) => {
    release = resolve;
  });
  jest.mocked(useBasket).mockReturnValue({ ...f.basket, add: () => accepted });
  f.screen.rerender(<ProductScreen />);
  try {
    f.review();
    fireEvent.press(f.screen.getByRole('button', { name: 'Add to basket' }));
    jest.mocked(useSession).mockReturnValue({ ...f.owner, ownerVersion: '1:true' });
    f.screen.rerender(<ProductScreen />);
    await act(async () => {
      release();
      await accepted;
    });
    expect(f.router.replace).not.toHaveBeenCalled();
    expect(f.screen.getByRole('button', { name: 'Next' })).toBeTruthy();
  } finally {
    release();
    f.close();
  }
});
it('withdraws cached ordering UI after product refresh fails while retaining a cache positive control', async () => {
  const f = await productJourneyFixture();
  try {
    f.review();
    const key = productQueryKey(f.context, f.product.id, 'en');
    expect(f.cache.getQueryData(key)).toBeDefined();
    f.fetcher.mockResolvedValue(response({}, 503));
    await act(async () => {
      void f.cache.refetchQueries({ queryKey: key, exact: true });
    });
    await waitFor(() =>
      expect(f.screen.queryByRole('button', { name: 'Add to basket' })).toBeNull(),
    );
    expect(f.screen.getByText('The menu is unavailable right now. Please try again.')).toBeTruthy();
    expect(f.cache.getQueryData(key)).toBeDefined();
    expect(f.basket.add).not.toHaveBeenCalled();
  } finally {
    f.close();
  }
});
