import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import NativeAccountActionScreen from './NativeAccountActionScreen';
import { pendingAccountActions } from '../../core/pendingAccountAction';
import { prepareAccountFixture, accountBootstrap, accountStore } from '../../test/accounts';
import useBootstrap from '../restaurant/useBootstrap';
import { useRestaurant } from '../restaurant/RestaurantProvider';
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
function capture(action = 'verify') {
  pendingAccountActions.capture(
    `https://links.example/r/alpha/${action}#proof=${nativeAccountProof}`,
    'https://links.example',
  );
}
beforeEach(() => {
  accountStore.values.clear();
  jest
    .mocked(useRouter)
    .mockReturnValue({ replace: jest.fn() } as unknown as ReturnType<typeof useRouter>);
});
afterEach(() => pendingAccountActions.clear());
it.each(['missing', 'read-only', 'removed', 'disabled-account'] as const)(
  'withdraws %s authority without completing a proof',
  (kind) => {
    const fixture = prepareAccountFixture();
    if (kind === 'missing')
      jest.mocked(useRestaurant).mockReturnValue({ ...fixture.state, directory: undefined });
    if (kind === 'removed')
      jest.mocked(useRestaurant).mockReturnValue({
        ...fixture.state,
        directory: { ...fixture.state.directory, tenants: [] },
      });
    if (kind === 'read-only')
      jest.mocked(useRestaurant).mockReturnValue({
        ...fixture.state,
        directory: {
          ...fixture.state.directory,
          tenants: fixture.state.directory.tenants.map((tenant) => ({
            ...tenant,
            status: 'read-only',
          })),
        },
      });
    if (kind === 'disabled-account')
      jest.mocked(useBootstrap).mockReturnValue({
        ...accountBootstrap,
        data: { ...accountBootstrap.data, flags: {} },
      } as ReturnType<typeof useBootstrap>);
    capture();
    const screen = render(<NativeAccountActionScreen />, { wrapper: fixture.Wrapper });
    try {
      expect(screen.getByText(/Account links are unavailable/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Verify my email' })).toBeNull();
      expect(fixture.fetcher).not.toHaveBeenCalled();
    } finally {
      screen.unmount();
      fixture.queryClient.clear();
    }
  },
);
it('a replacement link keeps its own proof and suppresses a previous completion result', async () => {
  const fixture = prepareAccountFixture();
  const old = deferred<Response>();
  fixture.fetcher
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(response({ success: true, data: 'ack' }));
  capture();
  const screen = render(<NativeAccountActionScreen />, { wrapper: fixture.Wrapper });
  try {
    fireEvent.press(screen.getByRole('button', { name: 'Verify my email' }));
    await waitFor(() => expect(fixture.fetcher).toHaveBeenCalledTimes(1));
    act(() => capture('recover'));
    expect(screen.getByLabelText('New password').props.value).toBe('');
    const replacementId = pendingAccountActions.snapshot()!.id;
    await act(async () => {
      old.resolve(nativeBootstrapResponse());
    });
    expect(fixture.fetcher).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Your email is verified/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Set my new password' })).toBeTruthy();
    expect(pendingAccountActions.take(replacementId)).toBe(nativeAccountProof);
  } finally {
    screen.unmount();
    fixture.queryClient.clear();
  }
});
it('does not dispatch a private proof after leaving during bootstrap', async () => {
  const fixture = prepareAccountFixture();
  const bootstrap = deferred<Response>();
  fixture.fetcher.mockReturnValueOnce(bootstrap.promise);
  capture();
  const screen = render(<NativeAccountActionScreen />, { wrapper: fixture.Wrapper });
  fireEvent.press(screen.getByRole('button', { name: 'Verify my email' }));
  await waitFor(() => expect(fixture.fetcher).toHaveBeenCalledTimes(1));
  await act(async () => {
    screen.unmount();
  });
  await act(async () => {
    bootstrap.resolve(nativeBootstrapResponse());
  });
  expect(fixture.fetcher).toHaveBeenCalledTimes(1);
  expect(pendingAccountActions.snapshot()).toBeUndefined();
  fixture.queryClient.clear();
});
it('does not dispatch an expired action even while its directory and mounted view remain current', async () => {
  const fixture = prepareAccountFixture();
  const started = Date.now();
  const bootstrap = deferred<Response>();
  fixture.fetcher.mockReturnValueOnce(bootstrap.promise);
  pendingAccountActions.capture(
    `https://links.example/r/alpha/verify#proof=${nativeAccountProof}`,
    'https://links.example',
    started - 599_000,
  );
  const screen = render(<NativeAccountActionScreen />, { wrapper: fixture.Wrapper });
  let clock: jest.SpyInstance | undefined;
  try {
    fireEvent.press(screen.getByRole('button', { name: 'Verify my email' }));
    await waitFor(() => expect(fixture.fetcher).toHaveBeenCalledTimes(1));
    clock = jest.spyOn(Date, 'now').mockReturnValue(started + 1001);
    expect(Date.parse(fixture.state.directory.expiresAt)).toBeGreaterThan(Date.now());
    await act(async () => {
      bootstrap.resolve(nativeBootstrapResponse());
    });
    expect(fixture.fetcher).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/We could not confirm the result/)).toBeTruthy();
  } finally {
    clock?.mockRestore();
    screen.unmount();
    fixture.queryClient.clear();
  }
});
it('does not publish completion success after the selected context changes', async () => {
  const fixture = prepareAccountFixture();
  const old = deferred<Response>();
  fixture.fetcher.mockResolvedValueOnce(nativeBootstrapResponse()).mockReturnValueOnce(old.promise);
  capture();
  const screen = render(<NativeAccountActionScreen />, { wrapper: fixture.Wrapper });
  try {
    fireEvent.press(screen.getByRole('button', { name: 'Verify my email' }));
    await waitFor(() => expect(fixture.fetcher).toHaveBeenCalledTimes(2));
    jest
      .mocked(useRestaurant)
      .mockReturnValue({ ...fixture.state, context: { ...fixture.context, generation: 999 } });
    screen.rerender(<NativeAccountActionScreen />);
    await act(async () => {
      old.resolve(response({ success: true, data: 'ack' }));
    });
    expect(screen.queryByText(/Your email is verified/)).toBeNull();
    expect(screen.getByText(/We could not confirm the result/)).toBeTruthy();
  } finally {
    screen.unmount();
    fixture.queryClient.clear();
  }
});
