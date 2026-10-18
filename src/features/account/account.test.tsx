import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AccountRoute from '../../../app/(restaurant)/account';
import { readProfile } from '../../api/profile';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import {
  prepareAccountFixture,
  accountStore,
  customerProfile,
  accountRepository,
} from '../../test/accounts';
import { authResponse, session } from '../../test/sessions';
import { response } from '../../test/transport';
import { secretKey } from '../../core/credentials';
import { tenantA } from '../../test/fixtures';
jest.mock('../../storage/sessions', () => ({
  deviceSessions:
    jest.requireActual<typeof import('../../test/accounts')>('../../test/accounts')
      .accountRepository,
}));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../restaurant/useBootstrap', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../api/profile', () => ({ readProfile: jest.fn() }));
beforeEach(() => {
  accountStore.values.clear();
  jest.restoreAllMocks();
});
it('signs in to this restaurant, shows the owned profile and clears private cache on logout', async () => {
  const fixture = prepareAccountFixture();
  fixture.fetcher.mockResolvedValue(authResponse());
  jest.mocked(readProfile).mockResolvedValue(customerProfile);
  fixture.queryClient.setQueryData(['staging', tenantA, 'public', 'menu'], 'public menu');
  fixture.queryClient.setQueryData(
    ['staging', tenantA, `customer:${tenantA}`, 'orders'],
    'private order',
  );
  const screen = render(<AccountRoute />, { wrapper: fixture.Wrapper });
  try {
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeTruthy());
    fireEvent.changeText(screen.getByLabelText('Email'), 'alex@example.test');
    fireEvent.changeText(screen.getByLabelText('Password'), 'password');
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByText('Alex Guest')).toBeTruthy());
    expect(screen.getByText('alex@example.test')).toBeTruthy();
    expect(fixture.fetcher).toHaveBeenCalledTimes(1);
    expect(fixture.fetcher.mock.calls[0]?.[1].headers).not.toHaveProperty('Authorization');
    fixture.queryClient.setQueryData(
      ['staging', tenantA, `customer:${tenantA}`, 'orders'],
      'private order',
    );
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getByLabelText('Password').props.value).toBe(''));
    expect(await accountRepository.load(fixture.context)).toBeNull();
    expect(
      fixture.queryClient.getQueryData(['staging', tenantA, `customer:${tenantA}`, 'orders']),
    ).toBeUndefined();
    expect(fixture.queryClient.getQueryData(['staging', tenantA, 'public', 'menu'])).toBe(
      'public menu',
    );
  } finally {
    screen.unmount();
    fixture.queryClient.clear();
  }
});
it('validates input without dispatch and clears a rejected password', async () => {
  const fixture = prepareAccountFixture();
  const screen = render(<AccountRoute />, { wrapper: fixture.Wrapper });
  try {
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeTruthy());
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter a valid email address and your password.')).toBeTruthy();
    expect(fixture.fetcher).not.toHaveBeenCalled();
    fixture.fetcher.mockResolvedValue(response({}, 401));
    fireEvent.changeText(screen.getByLabelText('Email'), 'alex@example.test');
    fireEvent.changeText(screen.getByLabelText('Password'), 'incorrect');
    fireEvent(screen.getByLabelText('Password'), 'submitEditing');
    await waitFor(() => expect(screen.getByLabelText('Password').props.value).toBe(''));
    expect(screen.getByText(/We could not sign you in/)).toBeTruthy();
  } finally {
    screen.unmount();
    fixture.queryClient.clear();
  }
});
it('restores a session and offers a profile retry while sign-out stays available', async () => {
  const fixture = prepareAccountFixture();
  await accountRepository.activate(fixture.context, session, () => true);
  jest
    .mocked(readProfile)
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValueOnce({
      ...customerProfile,
      phoneNumber: '+41791234567',
      isEmailConfirmed: false,
    });
  const screen = render(<AccountRoute />, { wrapper: fixture.Wrapper });
  try {
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('+41791234567')).toBeTruthy());
    expect(screen.getByText(/Check your email to verify/)).toBeTruthy();
  } finally {
    screen.unmount();
    fixture.queryClient.clear();
  }
});
it('retains cleanup across Account remount after the pointer was removed and retries the actual credential deletion', async () => {
  const fixture = prepareAccountFixture();
  await accountRepository.activate(fixture.context, session, () => true);
  const key = secretKey(fixture.context, 'session', { kind: 'customer', id: tenantA });
  await accountRepository.vault.saveCapability(
    fixture.context,
    'table-participant',
    { kind: 'customer', id: tenantA },
    'table-secret',
  );
  const remove = accountStore.remove;
  let fail = true;
  jest
    .spyOn(accountStore, 'remove')
    .mockImplementation((candidate) =>
      fail && candidate === key ? Promise.reject(new Error('Locked')) : remove(candidate),
    );
  jest.mocked(readProfile).mockResolvedValue(customerProfile);
  const screen = render(<AccountRoute />, { wrapper: fixture.Wrapper });
  try {
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy());
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getByText(/Sign-out could not be completed/)).toBeTruthy());
    expect(accountStore.values.has(`v2.staging.${tenantA}.active-customer`)).toBe(false);
    expect(accountStore.values.has(key)).toBe(true);
    screen.rerender(<AccountRoute key="remounted" />);
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(screen.getByText(/Sign-out could not be completed/)).toBeTruthy();
    fail = false;
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeTruthy());
    expect(accountStore.values.size).toBe(0);
  } finally {
    screen.unmount();
    fixture.queryClient.clear();
  }
});
it('discards typed credentials on restaurant-generation change', async () => {
  const fixture = prepareAccountFixture();
  const screen = render(<AccountRoute />, { wrapper: fixture.Wrapper });
  try {
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeTruthy());
    fireEvent.changeText(screen.getByLabelText('Email'), 'alex@example.test');
    fireEvent.changeText(screen.getByLabelText('Password'), 'never-forward');
    jest.mocked(useRestaurant).mockReturnValue({
      ...fixture.state,
      context: { ...fixture.context, generation: fixture.context.generation + 1 },
    });
    await act(async () => {
      screen.rerender(<AccountRoute />);
    });
    await waitFor(() => expect(screen.getByLabelText('Email').props.value).toBe(''));
    expect(screen.getByLabelText('Password').props.value).toBe('');
    expect(fixture.fetcher).not.toHaveBeenCalled();
  } finally {
    screen.unmount();
    fixture.queryClient.clear();
  }
});
