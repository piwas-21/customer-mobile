import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { openBrowserAsync } from 'expo-web-browser';
import AccountRoute from '../../../app/(restaurant)/account';
import { accountStore, accountRepository, prepareAccountFixture } from '../../test/accounts';
import { authResponse } from '../../test/sessions';
import { response } from '../../test/transport';
jest.mock('../../storage/sessions', () => ({
  deviceSessions:
    jest.requireActual<typeof import('../../test/accounts')>('../../test/accounts')
      .accountRepository,
}));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../restaurant/useBootstrap', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
beforeEach(() => {
  accountStore.values.clear();
  jest.restoreAllMocks();
});
it('validates registration and discards the returned session before explicit sign-in', async () => {
  const fixture = prepareAccountFixture();
  const screen = render(<AccountRoute />, { wrapper: fixture.Wrapper });
  try {
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create account' })).toBeTruthy(),
    );
    fireEvent.changeText(screen.getByLabelText('Password'), 'previous-password');
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    fireEvent.changeText(screen.getByLabelText('First name'), 'New');
    fireEvent.changeText(screen.getByLabelText('Last name'), 'Guest');
    fireEvent.changeText(screen.getByLabelText('Email'), 'new@example.test');
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText(/Check the required fields/)).toBeTruthy();
    expect(fixture.fetcher).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('Password'), 'Str0ng!Passw0rd');
    fireEvent.changeText(screen.getByLabelText('Confirm password'), 'Str0ng!Passw0rd');
    fixture.fetcher.mockResolvedValue(authResponse());
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(screen.getByText(/Your account was created/)).toBeTruthy());
    expect(fixture.fetcher.mock.calls[0]?.[0]).toBe(
      'https://alpha.example/api/User/register/customer',
    );
    expect(await accountRepository.load(fixture.context)).toBeNull();
    expect(accountStore.values.size).toBe(0);
    fireEvent.press(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.getByLabelText('Password').props.value).toBe('');
  } finally {
    screen.unmount();
    fixture.queryClient.clear();
  }
});
it('opens legal pages only on the approved restaurant website and reports an opening failure', async () => {
  const fixture = prepareAccountFixture();
  const screen = render(<AccountRoute />, { wrapper: fixture.Wrapper });
  try {
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create account' })).toBeTruthy(),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    fireEvent.press(screen.getByRole('button', { name: 'Restaurant privacy policy' }));
    await waitFor(() =>
      expect(openBrowserAsync).toHaveBeenCalledWith('https://alpha.example/privacy-policy'),
    );
    jest.mocked(openBrowserAsync).mockRejectedValueOnce(new Error('Browser unavailable'));
    fireEvent.press(screen.getByRole('button', { name: 'Restaurant terms of use' }));
    await waitFor(() => expect(screen.getByText(/This page could not be opened/)).toBeTruthy());
    expect(openBrowserAsync).toHaveBeenCalledWith('https://alpha.example/terms-of-usage');
    fireEvent.press(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  } finally {
    screen.unmount();
    fixture.queryClient.clear();
  }
});
it('requests recovery with a generic confirmation instead of server-supplied account information', async () => {
  const fixture = prepareAccountFixture();
  fixture.fetcher.mockResolvedValue(response({ success: true, data: 'private server wording' }));
  const screen = render(<AccountRoute />, { wrapper: fixture.Wrapper });
  try {
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeTruthy(),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Forgot password?' }));
    fireEvent.changeText(screen.getByLabelText('Email'), 'guest@example.test');
    fireEvent.press(screen.getByRole('button', { name: 'Send reset instructions' }));
    await waitFor(() => expect(screen.getByText(/If an account matches this email/)).toBeTruthy());
    expect(screen.queryByText('private server wording')).toBeNull();
    expect(fixture.fetcher).toHaveBeenCalledTimes(1);
    expect(fixture.fetcher.mock.calls[0]?.[0]).toBe(
      'https://alpha.example/api/Auth/forgot-password',
    );
    fireEvent.press(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  } finally {
    screen.unmount();
    fixture.queryClient.clear();
  }
});
it('reports request failure without silently retrying or claiming an email was sent', async () => {
  const fixture = prepareAccountFixture();
  fixture.fetcher.mockRejectedValue(new Error('Offline'));
  const screen = render(<AccountRoute />, { wrapper: fixture.Wrapper });
  try {
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeTruthy(),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Forgot password?' }));
    fireEvent.changeText(screen.getByLabelText('Email'), 'guest@example.test');
    fireEvent.press(screen.getByRole('button', { name: 'Send reset instructions' }));
    await waitFor(() =>
      expect(screen.getByText(/The request could not be completed/)).toBeTruthy(),
    );
    expect(screen.queryByText(/If an account matches this email/)).toBeNull();
    expect(fixture.fetcher).toHaveBeenCalledTimes(1);
  } finally {
    screen.unmount();
    fixture.queryClient.clear();
  }
});
