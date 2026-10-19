import '../../i18n';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { Modal } from 'react-native';
import BasketNotice from './BasketNotice';
import { basketState } from '../../test/basketState';
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
it('does not cancel on opening or dismissing the explanation; confirmation seals once', async () => {
  let complete!: () => void;
  const basket = basketState({
    hasPending: true,
    cancel: jest.fn(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    ),
  });
  const screen = render(<BasketNotice basket={basket} />);
  fireEvent.press(screen.getByRole('button', { name: 'Stop retrying this change' }));
  expect(screen.getByText(/An already applied change stays/)).toBeTruthy();
  expect(basket.cancel).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  fireEvent.press(screen.getByRole('button', { name: 'Stop retrying this change' }));
  fireEvent.press(screen.getByRole('button', { name: 'Confirm and check outcome' }));
  fireEvent.press(screen.getByRole('button', { name: 'Confirm and check outcome' }));
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(basket.cancel).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole('button', { name: 'Confirm and check outcome', busy: true }),
  ).toBeTruthy();
  await act(async () => complete());
  expect(screen.queryByText(/An already applied change stays/)).toBeNull();
});
it('a restored cancellation only offers cancellation recovery and retains the hold on failure', async () => {
  const basket = basketState({
    hasPending: true,
    cancelling: true,
    cancel: jest.fn(async () => {
      throw new Error('offline');
    }),
  });
  const screen = render(<BasketNotice basket={basket} />);
  expect(screen.queryByRole('button', { name: 'Check earlier change' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Finish cancellation check' }));
  fireEvent.press(
    within(screen.UNSAFE_getByType(Modal)).getByRole('button', {
      name: 'Finish cancellation check',
    }),
  );
  await waitFor(() =>
    expect(screen.getAllByText(/The result is still unconfirmed/).length).toBeGreaterThan(0),
  );
  expect(basket.recover).not.toHaveBeenCalled();
  expect(basket.cancel).toHaveBeenCalledTimes(1);
});
it.each([
  [
    'Applied',
    'The earlier change was already applied. It has not been undone. Review your current basket.',
  ],
  ['Cancelled', 'The earlier change was stopped. Review your current basket before continuing.'],
] as const)('announces the actual %s decision without claiming an undo', (resolution, message) => {
  const screen = render(<BasketNotice basket={basketState({ resolution })} />);
  expect(screen.getByRole('alert')).toHaveTextContent(message);
});
