import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import NativeAccountActionScreen from './NativeAccountActionScreen';
import AccountRoute from '../../../app/(restaurant)/account';
import AccountRequestForm from './AccountRequestForm';
import { pendingAccountActions } from '../../core/pendingAccountAction';
import { prepareAccountFixture, accountBootstrap, accountStore } from '../../test/accounts';
import useBootstrap from '../restaurant/useBootstrap';
import { nativeBootstrapResponse, nativeAccountProof } from '../../test/nativeAccounts';
import { response } from '../../test/transport';
import { deferred } from '../../test/deferred';
jest.mock('../../storage/sessions', () => ({
  deviceSessions:
    jest.requireActual<typeof import('../../test/accounts')>('../../test/accounts')
      .accountRepository,
}));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../restaurant/useBootstrap', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: jest.fn() }));
function capability(enabled: boolean) {
  jest.mocked(useBootstrap).mockReturnValue({
    ...accountBootstrap,
    data: { ...accountBootstrap.data, flags: { nativeAccountLinksV1: enabled } },
  } as unknown as ReturnType<typeof useBootstrap>);
}
beforeEach(() => {
  accountStore.values.clear();
  jest
    .mocked(useRouter)
    .mockReturnValue({ replace: jest.fn() } as unknown as ReturnType<typeof useRouter>);
});
afterEach(() => pendingAccountActions.clear());
it('withdraws a paused completion when the on-screen native capability is disabled', async () => {
  const fixture = prepareAccountFixture();
  const bootstrap = deferred<Response>();
  fixture.fetcher.mockReturnValueOnce(bootstrap.promise);
  pendingAccountActions.capture(
    `https://links.example/r/alpha/verify#proof=${nativeAccountProof}`,
    'https://links.example',
  );
  const screen = render(<NativeAccountActionScreen />, { wrapper: fixture.Wrapper });
  try {
    fireEvent.press(screen.getByRole('button', { name: 'Verify my email' }));
    await waitFor(() => expect(fixture.fetcher).toHaveBeenCalledTimes(1));
    capability(false);
    screen.rerender(<NativeAccountActionScreen />);
    await act(async () => {
      bootstrap.resolve(nativeBootstrapResponse());
    });
    expect(fixture.fetcher).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Your email is verified/)).toBeNull();
    expect(screen.getByText(/We could not confirm the result/)).toBeTruthy();
  } finally {
    screen.unmount();
    fixture.queryClient.clear();
  }
});
it('clears private registration fields when native account access is withdrawn and restored', async () => {
  const fixture = prepareAccountFixture();
  const screen = render(<AccountRoute />, { wrapper: fixture.Wrapper });
  try {
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create account' })).toBeTruthy(),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    fireEvent.changeText(screen.getByLabelText('First name'), 'Private');
    fireEvent.changeText(screen.getByLabelText('Email'), 'private@example.test');
    fireEvent.changeText(screen.getByLabelText('Password'), 'Str0ng!Passw0rd');
    capability(false);
    screen.rerender(<AccountRoute />);
    expect(screen.queryByLabelText('Password')).toBeNull();
    capability(true);
    screen.rerender(<AccountRoute />);
    expect(screen.getByLabelText('First name').props.value).toBe('');
    expect(screen.getByLabelText('Email').props.value).toBe('');
    expect(screen.getByLabelText('Password').props.value).toBe('');
    expect(fixture.fetcher).not.toHaveBeenCalled();
  } finally {
    screen.unmount();
    fixture.queryClient.clear();
  }
});
it('withdraws an email write when its form is left during the capability read', async () => {
  const fixture = prepareAccountFixture();
  const bootstrap = deferred<Response>();
  fixture.fetcher.mockReturnValueOnce(bootstrap.promise);
  const screen = render(<AccountRequestForm mode="recovery" onBack={jest.fn()} />, {
    wrapper: fixture.Wrapper,
  });
  fireEvent.changeText(screen.getByLabelText('Email'), 'private@example.test');
  fireEvent.press(screen.getByRole('button', { name: 'Send reset instructions' }));
  await waitFor(() => expect(fixture.fetcher).toHaveBeenCalledTimes(1));
  await act(async () => {
    screen.unmount();
  });
  await act(async () => {
    bootstrap.resolve(nativeBootstrapResponse());
  });
  expect(fixture.fetcher).toHaveBeenCalledTimes(1);
  fixture.queryClient.clear();
});
it('connects explicit verification resend with generic copy and no credentials', async () => {
  const fixture = prepareAccountFixture();
  fixture.fetcher
    .mockResolvedValueOnce(nativeBootstrapResponse())
    .mockResolvedValueOnce(response({ success: true, data: 'private wording' }));
  const screen = render(<AccountRoute />, { wrapper: fixture.Wrapper });
  try {
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Need a verification email?' })).toBeTruthy(),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Need a verification email?' }));
    fireEvent.changeText(screen.getByLabelText('Email'), 'guest@example.test');
    fireEvent.press(screen.getByRole('button', { name: 'Send verification instructions' }));
    await waitFor(() =>
      expect(screen.getByText(/If this account needs verification/)).toBeTruthy(),
    );
    expect(fixture.fetcher.mock.calls[1]?.[0]).toBe(
      'https://alpha.example/api/customer-mobile/auth/request-verification',
    );
    expect(fixture.fetcher.mock.calls[1]?.[1].headers).not.toHaveProperty('Authorization');
    expect(screen.queryByText('private wording')).toBeNull();
  } finally {
    screen.unmount();
    fixture.queryClient.clear();
  }
});
