import '../../i18n';
import { fireEvent, render } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import BasketScreen from './BasketScreen';
import BasketShortcut from './BasketShortcut';
import { useBasket } from './BasketProvider';
import useBootstrap from '../restaurant/useBootstrap';
import { basketState } from '../../test/basketState';
import { basketResponse } from '../../test/basketApi';
import { bootstrapSchema } from '../../core/capabilities';
import { tenantA } from '../../test/fixtures';
import { routerFixture } from '../../test/router';
jest.mock('./BasketProvider', () => ({ useBasket: jest.fn() }));
jest.mock('../restaurant/useBootstrap', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: jest.fn(), Stack: { Screen: () => null } }));
beforeEach(() => {
  jest.mocked(useBootstrap).mockReturnValue({
    data: bootstrapSchema.parse({
      schemaVersion: 1,
      tenantId: tenantA,
      currency: 'EUR',
      locale: 'en',
      timezone: 'Europe/Amsterdam',
      lifecycle: 'active',
      compatibility: 'supported',
      modules: [],
      flags: {},
      capabilities: { ordering: 'enabled' },
    }),
    isPending: false,
  } as ReturnType<typeof useBootstrap>);
  jest.mocked(useRouter).mockReturnValue(routerFixture());
});
it('shows server totals, instructions/removals and a persistent basket destination', () => {
  const state = basketState({ basket: basketResponse() });
  jest.mocked(useBasket).mockReturnValue(state);
  const screen = render(<BasketScreen />);
  expect(screen.getByText('Meal × 2')).toBeTruthy();
  expect(screen.getByText('Without Onion')).toBeTruthy();
  expect(screen.getByText('Total: €17.20')).toBeTruthy();
  expect(screen.getByText('Subtotal: €14.00')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Checkout' })).toBeNull();
  screen.unmount();
  const shortcut = render(<BasketShortcut />);
  fireEvent.press(shortcut.getByRole('button', { name: 'Basket · 2' }));
  expect(jest.mocked(useRouter)().push).toHaveBeenCalledWith('/basket');
});
it('requires an explicit recovery action even when the current basket already contains items', () => {
  const state = basketState({ basket: basketResponse(), hasPending: true, canAdd: false });
  jest.mocked(useBasket).mockReturnValue(state);
  const screen = render(<BasketScreen />);
  expect(state.recover).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Check earlier add' }));
  expect(state.recover).toHaveBeenCalledTimes(1);
});
it('withholds stale totals when a basket read failed and exposes refresh instead', () => {
  const state = basketState({ basket: basketResponse(), failed: true });
  jest.mocked(useBasket).mockReturnValue(state);
  const screen = render(<BasketScreen />);
  expect(screen.queryByText('Total: €17.20')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(state.refresh).toHaveBeenCalledTimes(1);
});
it('offers menu navigation from an empty basket and hides the shortcut when ordering is unavailable', () => {
  jest.mocked(useBasket).mockReturnValue(basketState({ unavailable: true }));
  const shortcut = render(<BasketShortcut />);
  expect(shortcut.queryByRole('button')).toBeNull();
  shortcut.unmount();
  const screen = render(<BasketScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Explore the menu' }));
  expect(jest.mocked(useRouter)().replace).toHaveBeenCalledWith('/menu');
});
