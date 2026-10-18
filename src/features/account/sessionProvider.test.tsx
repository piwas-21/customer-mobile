import { StrictMode, type PropsWithChildren } from 'react';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import AccountRoute from '../../../app/(restaurant)/account';
import { useSession } from './SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
import {
  accountFixture,
  accountStore,
  accountBootstrap,
  accountRepository,
} from '../../test/accounts';
import { session } from '../../test/sessions';
jest.mock('../../storage/sessions', () => ({
  deviceSessions:
    jest.requireActual<typeof import('../../test/accounts')>('../../test/accounts')
      .accountRepository,
}));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../restaurant/useBootstrap', () => ({ __esModule: true, default: jest.fn() }));
const bootstrap = (data = accountBootstrap.data, isPending = false) =>
  ({ ...accountBootstrap, data, isPending }) as ReturnType<typeof useBootstrap>;
beforeEach(() => {
  accountStore.values.clear();
  jest.restoreAllMocks();
});
it('fails closed before bootstrap and never restores credentials when accounts are disabled', async () => {
  const fixture = accountFixture();
  jest.mocked(useRestaurant).mockReturnValue(fixture.state);
  const load = jest.spyOn(accountRepository, 'load');
  jest.mocked(useBootstrap).mockReturnValue(bootstrap(undefined, true));
  const screen = render(<AccountRoute />, { wrapper: fixture.Wrapper });
  try {
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.queryByLabelText('Email')).toBeNull();
    jest
      .mocked(useBootstrap)
      .mockReturnValue(
        bootstrap({ ...accountBootstrap.data, capabilities: { accounts: 'disabled' } }),
      );
    screen.rerender(<AccountRoute />);
    expect(screen.getByText(/Account access is being prepared/)).toBeTruthy();
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(load).not.toHaveBeenCalled();
  } finally {
    screen.unmount();
    fixture.queryClient.clear();
  }
});
it('offers a real restore retry after secure-storage failure', async () => {
  const fixture = accountFixture();
  jest.mocked(useRestaurant).mockReturnValue(fixture.state);
  jest.mocked(useBootstrap).mockReturnValue(bootstrap());
  const load = jest
    .spyOn(accountRepository, 'load')
    .mockRejectedValueOnce(new Error('Device locked'));
  const screen = render(<AccountRoute />, { wrapper: fixture.Wrapper });
  try {
    await waitFor(() =>
      expect(screen.getByText(/Your saved session could not be opened/)).toBeTruthy(),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeTruthy());
    expect(load).toHaveBeenCalledTimes(2);
  } finally {
    screen.unmount();
    fixture.queryClient.clear();
  }
});
it('disposes the previous controller when capability access is withdrawn', async () => {
  const fixture = accountFixture();
  jest.mocked(useRestaurant).mockReturnValue(fixture.state);
  jest.mocked(useBootstrap).mockReturnValue(bootstrap());
  await accountRepository.activate(fixture.context, session, () => true);
  const hook = renderHook(() => useSession(), { wrapper: fixture.Wrapper });
  try {
    await waitFor(() => expect(hook.result.current.userId).toBe(session.userId));
    const controller = hook.result.current.controller;
    jest
      .mocked(useBootstrap)
      .mockReturnValue(bootstrap({ ...accountBootstrap.data, lifecycle: 'disabled' }));
    await act(async () => {
      hook.rerender(undefined);
    });
    expect(hook.result.current.controller).toBeUndefined();
    expect(hook.result.current.userId).toBeNull();
    expect(controller?.userId).toBeNull();
    await expect(
      controller?.login({ email: 'guest@example.test', password: 'password' }, 'en'),
    ).rejects.toMatchObject({ reason: 'refused' });
  } finally {
    hook.unmount();
    fixture.queryClient.clear();
  }
});
it('requires its provider', () => {
  function Probe() {
    useSession();
    return <Text>unreachable</Text>;
  }
  expect(() => render(<Probe />)).toThrow('SessionProvider is required');
});

it('restores safely through React StrictMode setup and cleanup replay', async () => {
  const fixture = accountFixture();
  jest.mocked(useRestaurant).mockReturnValue(fixture.state);
  jest.mocked(useBootstrap).mockReturnValue(bootstrap());
  await accountRepository.activate(fixture.context, session, () => true);
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <StrictMode>
        <fixture.Wrapper>{children}</fixture.Wrapper>
      </StrictMode>
    );
  }
  const hook = renderHook(() => useSession(), { wrapper: Wrapper });
  try {
    await waitFor(() => expect(hook.result.current.userId).toBe(session.userId));
    expect(hook.result.current.failed).toBe(false);
    expect(hook.result.current.loading).toBe(false);
  } finally {
    hook.unmount();
    fixture.queryClient.clear();
  }
});
