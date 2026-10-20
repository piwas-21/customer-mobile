import { StrictMode } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import NativeAccountActionScreen from './NativeAccountActionScreen';
import { pendingAccountActions } from '../../core/pendingAccountAction';
import { prepareAccountFixture, accountStore, accountRepository } from '../../test/accounts';
import { nativeBootstrapResponse, nativeAccountProof } from '../../test/nativeAccounts';
import { response } from '../../test/transport';
import { deferred } from '../../test/deferred';
import { tenantB } from '../../test/fixtures';
jest.mock('../../storage/sessions', () => ({
  deviceSessions:
    jest.requireActual<typeof import('../../test/accounts')>('../../test/accounts')
      .accountRepository,
}));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../restaurant/useBootstrap', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: jest.fn() }));
const replace = jest.fn();
function capture(action: 'verify' | 'recover' = 'verify', slug = 'alpha') {
  pendingAccountActions.capture(
    `https://links.example/r/${slug}/${action}#proof=${nativeAccountProof}`,
    'https://links.example',
  );
}
beforeEach(() => {
  accountStore.values.clear();
  jest.mocked(useRouter).mockReturnValue({ replace } as unknown as ReturnType<typeof useRouter>);
});
afterEach(() => {
  pendingAccountActions.clear();
});
it('requires explicit verification, consumes one private proof, and never signs in or caches it', async () => {
  const fixture = prepareAccountFixture();
  capture();
  fixture.fetcher
    .mockResolvedValueOnce(nativeBootstrapResponse())
    .mockResolvedValueOnce(response({ success: true, data: 'private response' }));
  const screen = render(
    <StrictMode>
      <NativeAccountActionScreen />
    </StrictMode>,
    { wrapper: fixture.Wrapper },
  );
  try {
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Verify my email' })).toBeTruthy(),
    );
    expect(fixture.fetcher).not.toHaveBeenCalled();
    const id = pendingAccountActions.snapshot()!.id;
    fireEvent.press(screen.getByRole('button', { name: 'Verify my email' }));
    await waitFor(() =>
      expect(screen.getByText('Your email is verified. You can now sign in.')).toBeTruthy(),
    );
    expect(fixture.fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fixture.fetcher.mock.calls[1]?.[1].body ?? '{}')).toEqual({
      schemaVersion: 1,
      proof: nativeAccountProof,
    });
    expect(() => pendingAccountActions.take(id)).toThrow();
    expect(await accountRepository.load(fixture.context)).toBeNull();
    expect(accountStore.values.size).toBe(0);
    expect(
      JSON.stringify(
        fixture.queryClient
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data),
      ),
    ).not.toContain(nativeAccountProof);
    expect(screen.queryByText('private response')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Account' }));
    expect(replace).toHaveBeenCalledWith('/account');
    expect(pendingAccountActions.snapshot()).toBeUndefined();
  } finally {
    screen.unmount();
    fixture.queryClient.clear();
  }
});
it('validates reset fields, serializes taps and clears passwords without repeating an ambiguous action', async () => {
  const fixture = prepareAccountFixture();
  capture('recover');
  const bootstrap = deferred<Response>();
  fixture.fetcher
    .mockReturnValueOnce(bootstrap.promise)
    .mockRejectedValueOnce(new Error('lost response'));
  const screen = render(<NativeAccountActionScreen />, { wrapper: fixture.Wrapper });
  try {
    const submit = screen.getByRole('button', { name: 'Set my new password' });
    fireEvent.press(submit);
    expect(screen.getByText(/Check the required fields/)).toBeTruthy();
    expect(fixture.fetcher).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('New password'), 'Str0ng!Passw0rd');
    fireEvent.changeText(screen.getByLabelText('Confirm password'), 'Str0ng!Passw0rd');
    fireEvent.press(submit);
    fireEvent.press(submit);
    await waitFor(() => expect(fixture.fetcher).toHaveBeenCalledTimes(1));
    await act(async () => {
      bootstrap.resolve(nativeBootstrapResponse());
    });
    await waitFor(() => expect(screen.getByText(/We could not confirm the result/)).toBeTruthy());
    expect(fixture.fetcher).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText('New password')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Set my new password' })).toBeNull();
    expect(JSON.parse(fixture.fetcher.mock.calls[1]?.[1].body ?? '{}')).toEqual({
      schemaVersion: 1,
      proof: nativeAccountProof,
      newPassword: 'Str0ng!Passw0rd',
      confirmPassword: 'Str0ng!Passw0rd',
    });
    expect(
      JSON.stringify(
        fixture.queryClient
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data),
      ),
    ).not.toMatch(/Str0ng|CCCCCCCC/);
  } finally {
    screen.unmount();
    fixture.queryClient.clear();
  }
});
it('names another restaurant and waits for explicit selection without completing its proof', () => {
  const fixture = prepareAccountFixture();
  const select = jest.fn(() => true);
  fixture.state.select = select;
  capture('verify', 'beta');
  const screen = render(<NativeAccountActionScreen />, { wrapper: fixture.Wrapper });
  try {
    expect(screen.getByText(/This account link is for Beta/)).toBeTruthy();
    expect(select).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Verify my email' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Continue at Beta' }));
    expect(select).toHaveBeenCalledWith(tenantB);
    expect(fixture.fetcher).not.toHaveBeenCalled();
  } finally {
    screen.unmount();
    fixture.queryClient.clear();
  }
});
it('withdraws malformed or missing entries and erases an unconsumed proof after leaving', async () => {
  const fixture = prepareAccountFixture();
  const screen = render(<NativeAccountActionScreen />, { wrapper: fixture.Wrapper });
  expect(screen.getByText(/This account link is missing/)).toBeTruthy();
  act(() => capture());
  expect(screen.getByRole('button', { name: 'Verify my email' })).toBeTruthy();
  await act(async () => {
    screen.unmount();
  });
  expect(pendingAccountActions.snapshot()).toBeUndefined();
  expect(fixture.fetcher).not.toHaveBeenCalled();
  fixture.queryClient.clear();
});
