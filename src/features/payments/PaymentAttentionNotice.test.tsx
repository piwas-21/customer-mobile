import '../../i18n';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useSession } from '../account/SessionProvider';
import PaymentAttentionNotice from './PaymentAttentionNotice';
import { sessionSetup } from '../../test/sessions';
import { deferred } from '../../test/deferred';
jest.mock('../account/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
async function fixture() {
  const f = await sessionSetup();
  jest.spyOn(f.controller, 'needsPaymentAttention', 'get').mockReturnValue(true);
  const separate = jest.spyOn(f.controller, 'continueForAnotherCustomer').mockResolvedValue();
  const state = {
    controller: f.controller,
    userId: null,
    ownerVersion: f.controller.ownerVersion,
    needsCleanup: false,
    needsPaymentAttention: true,
    loading: false,
    unavailable: false,
    failed: false,
    retry: jest.fn(),
  };
  return { ...f, state, separate };
}
it('withdraws the confirmation when another controller has the same textual owner version', async () => {
  const a = await fixture();
  const b = await fixture();
  expect(a.state.ownerVersion).toBe(b.state.ownerVersion);
  jest.mocked(useSession).mockReturnValue(a.state);
  const view = render(<PaymentAttentionNotice />);
  fireEvent.press(view.getByRole('button', { name: 'Use this device for another customer' }));
  jest.mocked(useSession).mockReturnValue(b.state);
  view.rerender(<PaymentAttentionNotice />);
  expect(view.queryByRole('button', { name: 'Continue for another customer' })).toBeNull();
  fireEvent.press(view.getByRole('button', { name: 'Use this device for another customer' }));
  fireEvent.press(view.getByRole('button', { name: 'Continue for another customer' }));
  await waitFor(() => expect(b.separate).toHaveBeenCalledTimes(1));
  expect(a.separate).not.toHaveBeenCalled();
});
it('withdraws an earlier confirmation after the same controller owner revision changes', async () => {
  const f = await fixture();
  jest.mocked(useSession).mockReturnValue(f.state);
  const view = render(<PaymentAttentionNotice />);
  fireEvent.press(view.getByRole('button', { name: 'Use this device for another customer' }));
  jest.mocked(useSession).mockReturnValue({ ...f.state, ownerVersion: 'new-owner' });
  view.rerender(<PaymentAttentionNotice />);
  expect(view.queryByRole('button', { name: 'Continue for another customer' })).toBeNull();
  expect(f.separate).not.toHaveBeenCalled();
});
it('a late former-owner completion cannot dismiss a newer owner confirmation', async () => {
  const a = await fixture();
  const b = await fixture();
  const result = deferred<void>();
  a.separate.mockReturnValue(result.promise);
  jest.mocked(useSession).mockReturnValue(a.state);
  const view = render(<PaymentAttentionNotice />);
  fireEvent.press(view.getByRole('button', { name: 'Use this device for another customer' }));
  fireEvent.press(view.getByRole('button', { name: 'Continue for another customer' }));
  jest.mocked(useSession).mockReturnValue(b.state);
  view.rerender(<PaymentAttentionNotice />);
  fireEvent.press(view.getByRole('button', { name: 'Use this device for another customer' }));
  await act(async () => {
    result.resolve();
    await result.promise;
  });
  expect(view.getByRole('button', { name: 'Continue for another customer' })).toBeTruthy();
  expect(b.separate).not.toHaveBeenCalled();
});
it('a late former-owner failure cannot erase a newer owner failure message', async () => {
  const a = await fixture();
  const b = await fixture();
  const result = deferred<void>();
  a.separate.mockReturnValue(result.promise);
  b.separate.mockRejectedValue(new Error('Locked'));
  jest.mocked(useSession).mockReturnValue(a.state);
  const view = render(<PaymentAttentionNotice />);
  fireEvent.press(view.getByRole('button', { name: 'Use this device for another customer' }));
  fireEvent.press(view.getByRole('button', { name: 'Continue for another customer' }));
  jest.mocked(useSession).mockReturnValue(b.state);
  view.rerender(<PaymentAttentionNotice />);
  fireEvent.press(view.getByRole('button', { name: 'Use this device for another customer' }));
  fireEvent.press(view.getByRole('button', { name: 'Continue for another customer' }));
  await waitFor(() =>
    expect(
      view.getByText('The device change could not be completed. Please try again.'),
    ).toBeTruthy(),
  );
  await act(async () => {
    result.reject(new Error('Former owner'));
    await Promise.resolve();
  });
  expect(
    view.getByText('The device change could not be completed. Please try again.'),
  ).toBeTruthy();
});
