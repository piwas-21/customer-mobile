import useCheckoutFields from './useCheckoutFields';
import { checkoutFields } from '../../domain/checkoutFields';
import { customerForms } from '../../test/customerForms';
import '../../i18n';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { BasketChannelPreview } from '../../api/basketChannelPreview';
import { useRouter } from 'expo-router';
import type { CustomerBasket } from '../../api/basketResponse';
import BasketScreen from './BasketScreen';
import BasketShortcut from './BasketShortcut';
import useOrderTypes from './useOrderTypes';
import { useBasket } from './BasketProvider';
import useBootstrap from '../restaurant/useBootstrap';
import { basketState } from '../../test/basketState';
import { basketResponse } from '../../test/basketApi';
import { bootstrapSchema } from '../../core/capabilities';
import { tenantA } from '../../test/fixtures';
import { routerFixture } from '../../test/router';
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
jest.mock('./useCheckoutFields', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('./useCheckoutSavedAddress', () => ({
  __esModule: true,
  default: () => ({ available: false, current: undefined }),
}));
jest.mock('./useOrderTypes', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('./BasketProvider', () => ({ useBasket: jest.fn() }));
jest.mock('../restaurant/useBootstrap', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: jest.fn(), Stack: { Screen: () => null } }));
beforeEach(() => {
  jest.mocked(useCheckoutFields).mockReturnValue({
    fields: checkoutFields(customerForms(), 'Takeaway'),
    isPending: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useCheckoutFields>);
  jest
    .mocked(useOrderTypes)
    .mockReturnValue({ data: ['Takeaway'], isPending: false } as ReturnType<typeof useOrderTypes>);
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
it('shows server totals, instructions/removals and a persistent basket destination', async () => {
  const state = basketState({ basket: { ...basketResponse(), orderType: 'Takeaway' } });
  jest.mocked(useBasket).mockReturnValue(state);
  const screen = render(<BasketScreen />);
  expect(screen.getByText('Meal × 2')).toBeTruthy();
  expect(screen.getByText('Without Onion')).toBeTruthy();
  expect(screen.getByText('Total: €17.20')).toBeTruthy();
  expect(screen.getByText('Subtotal: €14.00')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Checkout' })).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Checkout' }));
  expect(screen.getByLabelText('Full name')).toBeTruthy();
  expect(state.quote).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  screen.unmount();
  const shortcut = render(<BasketShortcut />);
  fireEvent.press(shortcut.getByRole('button', { name: 'Basket · 2' }));
  expect(jest.mocked(useRouter)().push).toHaveBeenCalledWith('/basket');
});
it('requires an explicit recovery action even when the current basket already contains items', async () => {
  const state = basketState({ basket: basketResponse(), hasPending: true, canAdd: false });
  jest.mocked(useBasket).mockReturnValue(state);
  const screen = render(<BasketScreen />);
  expect(state.recover).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Check earlier change' }));
  });
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
it('edits roots only and discards private drafts as soon as the basket owner changes', () => {
  const value: CustomerBasket = basketResponse();
  value.items[0]!.childItems = [
    { ...value.items[0]!, productName: 'Included child', childItems: [] },
  ];
  const first = basketState({ basket: value });
  jest.mocked(useBasket).mockReturnValue(first);
  const screen = render(<BasketScreen />);
  expect(screen.queryByRole('button', { name: 'Edit Included child' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Edit Meal' }));
  fireEvent.changeText(
    screen.getByLabelText('Instructions for the kitchen (optional)'),
    'Private draft',
  );
  const next = basketState({
    basket: basketResponse(),
    revision: [
      first.revision[0],
      first.revision[1],
      first.revision[2],
      first.revision[3],
      first.revision[4],
      'next-owner',
      first.revision[6],
    ],
  });
  jest.mocked(useBasket).mockReturnValue(next);
  screen.rerender(<BasketScreen />);
  expect(screen.queryByDisplayValue('Private draft')).toBeNull();
  expect(screen.queryByLabelText('Instructions for the kitchen (optional)')).toBeNull();
  expect(first.mutate).not.toHaveBeenCalled();
  expect(next.mutate).not.toHaveBeenCalled();
});
it('keeps the reviewed revision when the server basket changes and requires reopening the editor', () => {
  const state = basketState({ basket: basketResponse() });
  jest.mocked(useBasket).mockReturnValue(state);
  const screen = render(<BasketScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Edit Meal' }));
  const changed = {
    ...state,
    basket: { ...basketResponse(), purchaseFingerprint: 'B'.repeat(64) },
  };
  jest.mocked(useBasket).mockReturnValue(changed);
  screen.rerender(<BasketScreen />);
  expect(screen.getByText(/Your basket changed/)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Save changes', disabled: true }));
  expect(state.mutate).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  fireEvent.press(screen.getByRole('button', { name: 'Edit Meal' }));
  expect(screen.queryByText(/Your basket changed/)).toBeNull();
});
it('discards a private channel review and its late response when the basket owner changes', async () => {
  const value = basketResponse();
  let finish!: () => void;
  const first = basketState({
    basket: value,
    previewChannel: jest.fn(
      () =>
        new Promise<BasketChannelPreview>((resolve) => {
          finish = () =>
            resolve({
              basketId: value.id,
              purchaseFingerprint: value.purchaseFingerprint,
              orderType: 'Takeaway',
              conflicts: [
                {
                  basketItemId: value.items[0]!.id,
                  productName: 'Private earlier meal',
                  quantity: 2,
                  allowedOrderTypes: ['DineIn'],
                },
              ],
            });
        }),
    ),
  });
  jest.mocked(useBasket).mockReturnValue(first);
  const screen = render(<BasketScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'How would you like to order?' }));
  fireEvent.press(screen.getByRole('button', { name: 'Takeaway' }));
  const next = basketState({
    basket: value,
    revision: [
      first.revision[0],
      first.revision[1],
      first.revision[2],
      first.revision[3],
      first.revision[4],
      first.revision[5],
      2,
    ],
  });
  jest.mocked(useBasket).mockReturnValue(next);
  screen.rerender(<BasketScreen />);
  await act(async () => finish());
  expect(screen.queryByText('Private earlier meal × 2')).toBeNull();
  expect(screen.queryByText(/Remove listed items/)).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'How would you like to order?' }));
  expect(screen.getByRole('button', { name: 'Takeaway' })).toBeTruthy();
  expect(first.changeChannel).not.toHaveBeenCalled();
  expect(next.changeChannel).not.toHaveBeenCalled();
});

it('discards a private checkout contact draft immediately when the basket owner changes', () => {
  const first = basketState({ basket: { ...basketResponse(), orderType: 'Takeaway' } });
  jest.mocked(useBasket).mockReturnValue(first);
  const screen = render(<BasketScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Checkout' }));
  fireEvent.changeText(screen.getByLabelText('Email'), 'private@example.test');
  const next = basketState({
    basket: { ...basketResponse(), orderType: 'Takeaway' },
    revision: [
      first.revision[0],
      first.revision[1],
      first.revision[2],
      first.revision[3],
      first.revision[4],
      'new-owner',
      first.revision[6],
    ],
  });
  jest.mocked(useBasket).mockReturnValue(next);
  screen.rerender(<BasketScreen />);
  expect(screen.queryByDisplayValue('private@example.test')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Place order' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Checkout' }));
  expect(screen.getByLabelText('Email')).toHaveProp('value', '');
  expect(first.placeOrder).not.toHaveBeenCalled();
  expect(next.placeOrder).not.toHaveBeenCalled();
});
