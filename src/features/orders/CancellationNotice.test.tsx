import '../../i18n';
import { fireEvent, render } from '@testing-library/react-native';
import CancellationNotice from './CancellationNotice';
import { useCancellation } from './CancellationProvider';
import { cancellationControllerFixture } from '../../test/cancellationController';
import type { CancellationView } from '../../core/cancellationView';
jest.mock('./CancellationProvider', () => ({ useCancellation: jest.fn() }));
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
it('requires a new explicit confirmation for a later operation on the same controller', async () => {
  const f = await cancellationControllerFixture();
  const retry = jest.fn();
  const state = {
    controller: f.controller,
    value: {
      operationId: f.record.intent.operationId,
      orderId: f.record.intent.orderId,
      outcome: 'Unseen',
      reason: null,
    } as CancellationView,
    busy: false,
    loading: false,
    failed: false,
    retry,
    refresh: jest.fn(),
    confirm: jest.fn(),
  };
  jest.mocked(useCancellation).mockReturnValue(state);
  const view = render(<CancellationNotice />);
  fireEvent.press(view.getByRole('button', { name: 'Retry original cancellation request' }));
  expect(view.getByRole('button', { name: 'Retry the same cancellation request' })).toBeTruthy();
  state.value = { ...state.value, outcome: 'Cancelled' };
  view.rerender(<CancellationNotice />);
  expect(view.queryByRole('button', { name: 'Retry the same cancellation request' })).toBeNull();
  state.value = {
    ...state.value,
    operationId: '88888888-8888-4888-8888-888888888888',
    outcome: 'Unseen',
  };
  view.rerender(<CancellationNotice />);
  expect(view.queryByRole('button', { name: 'Retry the same cancellation request' })).toBeNull();
  expect(retry).not.toHaveBeenCalled();
  fireEvent.press(view.getByRole('button', { name: 'Retry original cancellation request' }));
  fireEvent.press(view.getByRole('button', { name: 'Retry the same cancellation request' }));
  expect(retry).toHaveBeenCalledWith('88888888-8888-4888-8888-888888888888');
});
