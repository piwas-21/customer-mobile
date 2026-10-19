import '../../i18n';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Modal } from 'react-native';
import BasketItemEditor from './BasketItemEditor';
import type { BasketItemEditProps } from './useBasketItemEdit';
import { basketState } from '../../test/basketState';
import { basketMutation } from '../../test/basketMutations';
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
function props(patch: Partial<BasketItemEditProps> = {}): BasketItemEditProps {
  const { basketItemId, expectedBasketId, expectedPurchaseFingerprint } = basketMutation();
  return {
    selection: {
      owner: basketState().revision,
      revision: { basketItemId, expectedBasketId, expectedPurchaseFingerprint },
      name: 'Meal',
      quantity: 2,
      instructions: null,
    },
    ready: true,
    changed: false,
    mutate: jest.fn(async () => undefined),
    onClose: jest.fn(),
    ...patch,
  };
}
it.each([null, '', 'No onion'])(
  'preserves exact %s instructions on a quantity-only edit',
  async (instructions) => {
    const input = props();
    const p = { ...input, selection: { ...input.selection, instructions } };
    const screen = render(<BasketItemEditor {...p} />);
    fireEvent.press(screen.getByRole('button', { name: 'Increase Quantity' }));
    fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(p.onClose).toHaveBeenCalledTimes(1));
    expect(p.mutate).toHaveBeenCalledWith({
      ...p.selection.revision,
      action: 'Update',
      quantity: 3,
      specialInstructions: instructions,
    });
  },
);
it('sends explicitly cleared notes and keeps the reviewed revision without prices or composition', async () => {
  const input = props();
  const p = { ...input, selection: { ...input.selection, instructions: 'No onion' } };
  const screen = render(<BasketItemEditor {...p} />);
  fireEvent.changeText(screen.getByLabelText('Instructions for the kitchen (optional)'), '');
  fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(p.onClose).toHaveBeenCalledTimes(1));
  expect(p.mutate).toHaveBeenCalledWith({
    ...p.selection.revision,
    action: 'Update',
    quantity: 2,
    specialInstructions: '',
  });
});
it('requires explicit removal confirmation and sends no quantity or instructions', async () => {
  const p = props();
  const screen = render(<BasketItemEditor {...p} />);
  fireEvent.press(screen.getByRole('button', { name: 'Remove item' }));
  expect(p.mutate).not.toHaveBeenCalled();
  expect(
    screen.getByText('Remove Meal × 2 and all its included choices from your basket?'),
  ).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Keep item' }));
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Remove item' }));
  fireEvent.press(screen.getByRole('button', { name: 'Yes, remove item' }));
  await waitFor(() => expect(p.onClose).toHaveBeenCalledTimes(1));
  expect(p.mutate).toHaveBeenCalledWith({ ...p.selection.revision, action: 'Remove' });
});
it('blocks duplicate taps and dismissal until the write settles, then retains an uncertain draft', async () => {
  let reject!: (error: Error) => void;
  const p = props({
    mutate: jest.fn(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    ),
  });
  const screen = render(<BasketItemEditor {...p} />);
  fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
  fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
  fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(p.mutate).toHaveBeenCalledTimes(1);
  fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');
  expect(p.onClose).not.toHaveBeenCalled();
  await act(async () => reject(new Error('Network interrupted')));
  expect(screen.getByText(/We could not confirm the change/)).toBeTruthy();
  expect(p.onClose).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(p.onClose).toHaveBeenCalledTimes(1);
});
it('withholds stale writes and never clamps a server quantity above native support', () => {
  const p = props();
  const screen = render(<BasketItemEditor {...p} changed />);
  fireEvent.press(screen.getByRole('button', { name: 'Save changes', disabled: true }));
  fireEvent.press(screen.getByRole('button', { name: 'Remove item', disabled: true }));
  expect(p.mutate).not.toHaveBeenCalled();
  screen.unmount();
  const other = render(<BasketItemEditor {...p} selection={{ ...p.selection, quantity: 100 }} />);
  expect(other.getByText(/This item has quantity 100/)).toBeTruthy();
  expect(other.queryByRole('adjustable')).toBeNull();
  expect(other.getByRole('button', { name: 'Save changes', disabled: true })).toBeTruthy();
  fireEvent.press(other.getByRole('button', { name: 'Remove item' }));
  expect(other.getByRole('button', { name: 'Yes, remove item', disabled: false })).toBeTruthy();
});
it('ignores a late write result after the editor owner has unmounted', async () => {
  let complete!: () => void;
  const p = props({
    mutate: jest.fn(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    ),
  });
  const screen = render(<BasketItemEditor {...p} />);
  fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
  screen.unmount();
  await act(async () => complete());
  expect(p.onClose).not.toHaveBeenCalled();
});
