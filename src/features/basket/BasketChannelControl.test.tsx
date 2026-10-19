import '../../i18n';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Modal, useColorScheme } from 'react-native';
import BasketChannelControl from './BasketChannelControl';
import useOrderTypes from './useOrderTypes';
import { basketState } from '../../test/basketState';
import { basketResponse } from '../../test/basketApi';
jest.mock('./useOrderTypes', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
beforeEach(() => {
  jest
    .mocked(useOrderTypes)
    .mockReturnValue({ data: ['Takeaway', 'Delivery'], isPending: false } as ReturnType<
      typeof useOrderTypes
    >);
});
function setup() {
  const value = basketResponse();
  const preview = {
    basketId: value.id,
    purchaseFingerprint: value.purchaseFingerprint,
    orderType: 'Takeaway' as const,
    conflicts: [
      {
        basketItemId: value.items[0]!.id,
        productName: 'Meal',
        quantity: 2,
        allowedOrderTypes: ['DineIn' as const],
      },
    ],
  };
  const state = basketState({ basket: value, previewChannel: jest.fn(async () => preview) });
  const screen = render(<BasketChannelControl basket={state} />);
  const open = () =>
    fireEvent.press(screen.getByRole('button', { name: 'How would you like to order?' }));
  const prepare = async () => {
    open();
    fireEvent.press(screen.getByRole('button', { name: 'Takeaway' }));
    await waitFor(() => expect(screen.getByText('Meal × 2')).toBeTruthy());
  };
  return { value, preview, state, screen, open, prepare };
}
it.each(['light', 'dark'] as const)(
  'requires explicit confirmation of the listed root removals in %s theme',
  async (scheme) => {
    jest.mocked(useColorScheme).mockReturnValue(scheme);
    const f = setup();
    f.open();
    expect(f.state.previewChannel).not.toHaveBeenCalled();
    expect(f.state.changeChannel).not.toHaveBeenCalled();
    fireEvent.press(f.screen.getByRole('button', { name: 'Takeaway' }));
    await waitFor(() => expect(f.screen.getByText('Meal × 2')).toBeTruthy());
    expect(f.state.changeChannel).not.toHaveBeenCalled();
    fireEvent.press(
      f.screen.getByRole('button', { name: 'Remove listed items and change to Takeaway' }),
    );
    await waitFor(() => expect(f.state.changeChannel).toHaveBeenCalledTimes(1));
    expect(f.state.changeChannel).toHaveBeenCalledWith({
      expectedBasketId: f.value.id,
      expectedPurchaseFingerprint: f.value.purchaseFingerprint,
      orderType: 'Takeaway',
      confirmedConflictItemIds: [f.value.items[0]!.id],
    });
    await waitFor(() => expect(f.screen.queryByText('Meal × 2')).toBeNull());
  },
);
it('keeps the original preview and blocks a stale basket instead of silently approving new removals', async () => {
  const f = setup();
  await f.prepare();
  f.screen.rerender(
    <BasketChannelControl
      basket={{ ...f.state, basket: { ...f.value, purchaseFingerprint: 'B'.repeat(64) } }}
    />,
  );
  expect(f.screen.getByText(/Your basket changed/)).toBeTruthy();
  fireEvent.press(
    f.screen.getByRole('button', {
      name: 'Remove listed items and change to Takeaway',
      disabled: true,
    }),
  );
  expect(f.state.changeChannel).not.toHaveBeenCalled();
  fireEvent.press(f.screen.getByRole('button', { name: 'Back' }));
  fireEvent.press(f.screen.getByRole('button', { name: 'Close' }));
  expect(f.screen.queryByText('Meal × 2')).toBeNull();
});
it('blocks confirmation when ordering is withdrawn or the target is no longer enabled', async () => {
  const f = setup();
  await f.prepare();
  jest
    .mocked(useOrderTypes)
    .mockReturnValue({ data: ['Delivery'], isPending: false } as ReturnType<typeof useOrderTypes>);
  f.screen.rerender(<BasketChannelControl basket={{ ...f.state, canAdd: false }} />);
  fireEvent.press(
    f.screen.getByRole('button', {
      name: 'Remove listed items and change to Takeaway',
      disabled: true,
    }),
  );
  expect(f.state.changeChannel).not.toHaveBeenCalled();
});
it('blocks duplicate writes and dismissal while confirming, then leaves failure for explicit basket recovery', async () => {
  const f = setup();
  let reject!: (error: Error) => void;
  jest.mocked(f.state.changeChannel).mockImplementation(
    () =>
      new Promise<void>((_resolve, fail) => {
        reject = fail;
      }),
  );
  await f.prepare();
  const confirm = () =>
    fireEvent.press(
      f.screen.getByRole('button', { name: 'Remove listed items and change to Takeaway' }),
    );
  confirm();
  confirm();
  fireEvent(f.screen.UNSAFE_getByType(Modal), 'requestClose');
  expect(f.state.changeChannel).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error('unknown outcome')));
  expect(f.screen.getByText(/Close this screen and check your basket/)).toBeTruthy();
  f.screen.rerender(
    <BasketChannelControl basket={{ ...f.state, hasPending: true, canAdd: false }} />,
  );
  fireEvent.press(f.screen.getByRole('button', { name: 'Review current basket' }));
  expect(f.state.refresh).toHaveBeenCalledTimes(1);
  expect(f.screen.queryByText('Meal × 2')).toBeNull();
  expect(f.state.changeChannel).toHaveBeenCalledTimes(1);
});
