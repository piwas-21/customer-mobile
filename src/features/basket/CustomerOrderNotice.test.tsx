import '../../i18n';
import { act, fireEvent, render } from '@testing-library/react-native';
import { basketState } from '../../test/basketState';
import { appliedOrder } from '../../test/customerOrder';
import CustomerOrderNotice from './CustomerOrderNotice';
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
it('an unknown outcome never retries automatically and stopping it requires a separate explicit confirmation', async () => {
  const basket = basketState({
    pendingOrder: { cancelling: false, canResume: true, cleanupPending: false },
    canAdd: false,
  });
  const screen = render(<CustomerOrderNotice basket={basket} />);
  expect(basket.recoverOrder).not.toHaveBeenCalled();
  await act(async () =>
    fireEvent.press(screen.getByRole('button', { name: 'Check earlier order' })),
  );
  expect(basket.recoverOrder).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByRole('button', { name: 'Stop this attempt' }));
  expect(basket.cancelOrder).not.toHaveBeenCalled();
  expect(screen.getByText(/An order already received stays in place/)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Keep checking the order' }));
  expect(basket.cancelOrder).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Stop this attempt' }));
  await act(async () =>
    fireEvent.press(screen.getByRole('button', { name: 'Stop if not received and check' })),
  );
  expect(basket.cancelOrder).toHaveBeenCalledTimes(1);
  expect(basket.placeOrder).not.toHaveBeenCalled();
});
it('a persisted cancellation choice offers only its continuation and keeps failures pending', async () => {
  const basket = basketState({
    pendingOrder: { cancelling: true, canResume: false, cleanupPending: false },
    recoverOrder: jest.fn(async () => {
      throw new Error('Unknown cancellation');
    }),
  });
  const screen = render(<CustomerOrderNotice basket={basket} />);
  expect(screen.queryByRole('button', { name: 'Stop this attempt' })).toBeNull();
  await act(async () =>
    fireEvent.press(screen.getByRole('button', { name: 'Finish order check' })),
  );
  expect(basket.recoverOrder).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/A check to stop the earlier attempt is pending/)).toBeTruthy();
});
it('reports received and cancelled outcomes separately without displaying technical order identity', () => {
  const screen = render(
    <CustomerOrderNotice
      basket={basketState({
        orderDecision: { ...appliedOrder(), schemaVersion: 1, outcome: 'Applied' },
      })}
    />,
  );
  expect(screen.getByText('Your order was received by the restaurant.')).toBeTruthy();
  expect(screen.queryByText(appliedOrder().orderId)).toBeNull();
  screen.rerender(
    <CustomerOrderNotice
      basket={basketState({
        orderDecision: { ...appliedOrder(), schemaVersion: 1, outcome: 'Cancelled', orderId: null },
      })}
    />,
  );
  expect(screen.getByText(/This attempt was stopped/)).toBeTruthy();
});
