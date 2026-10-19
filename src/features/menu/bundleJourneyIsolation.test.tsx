import { act, fireEvent } from '@testing-library/react-native';
import ProductScreen from './ProductScreen';
import { useSession } from '../account/SessionProvider';
import { productJourneyFixture } from '../../test/productJourney';
import { bundleProduct } from '../../test/bundles';
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
it('connects bundle ordering through real product queries and discards private nested notes across owner changes', async () => {
  const f = await productJourneyFixture(bundleProduct());
  function review() {
    fireEvent.press(f.screen.getByRole('button', { name: 'Next' }));
    fireEvent.press(f.screen.getByRole('checkbox', { name: 'Meat · Small' }));
    fireEvent.press(f.screen.getByRole('button', { name: 'Increase Meat · Small quantity' }));
    fireEvent.press(f.screen.getByRole('button', { name: 'Next' }));
    expect(f.screen.getByText('Review your bundle')).toBeTruthy();
  }
  try {
    review();
    const label = 'Instructions for Deux viandes · Meat · Small (optional)';
    fireEvent.changeText(f.screen.getByLabelText(label), 'Private nested note');
    jest.mocked(useSession).mockReturnValue({ ...f.owner, ownerVersion: '1:true' });
    f.screen.rerender(<ProductScreen />);
    expect(f.screen.queryByRole('button', { name: 'Add to basket' })).toBeNull();
    review();
    expect(f.screen.getByLabelText(label)).toHaveProp('value', '');
    expect(f.basket.add).not.toHaveBeenCalled();
  } finally {
    f.close();
  }
});
