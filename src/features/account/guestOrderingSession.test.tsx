import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useSession } from './SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
import {
  accountFixture,
  accountStore,
  accountRepository,
  accountBootstrap,
} from '../../test/accounts';
import { session } from '../../test/sessions';
import { z } from 'zod';
import { response } from '../../test/transport';
jest.mock('../../storage/sessions', () => ({
  deviceSessions:
    jest.requireActual<typeof import('../../test/accounts')>('../../test/accounts')
      .accountRepository,
}));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../restaurant/useBootstrap', () => ({ __esModule: true, default: jest.fn() }));
const guestBootstrap: typeof accountBootstrap = {
  ...accountBootstrap,
  data: {
    ...accountBootstrap.data,
    capabilities: { accounts: 'disabled' as const, ordering: 'enabled' as const },
  },
};
beforeEach(() => {
  accountStore.values.clear();
  jest.restoreAllMocks();
});
it('initializes a guest owner when ordering alone is enabled without reading or deleting a saved account', async () => {
  const fixture = accountFixture();
  jest.mocked(useRestaurant).mockReturnValue(fixture.state);
  jest.mocked(useBootstrap).mockReturnValue(guestBootstrap as ReturnType<typeof useBootstrap>);
  await accountRepository.activate(fixture.context, session, () => true);
  const saved = new Map(accountStore.values);
  const load = jest.spyOn(accountRepository, 'load');
  const hook = renderHook(() => useSession(), { wrapper: fixture.Wrapper });
  try {
    await waitFor(() => expect(hook.result.current.controller).toBeDefined());
    expect(hook.result.current.unavailable).toBe(true);
    expect(hook.result.current.userId).toBeNull();
    expect(load).not.toHaveBeenCalled();
    const controller = hook.result.current.controller!;
    expect(() => controller.captureRequestOwner({ kind: 'guest', id: 'basket' })()).not.toThrow();
    expect(() =>
      controller.captureRequestOwner({ kind: 'customer', id: session.userId }),
    ).toThrow();
    await expect(
      controller.login({ email: 'guest@example.test', password: 'password' }, 'en'),
    ).rejects.toMatchObject({ status: 401, reason: 'refused' });
    await act(() => controller.logout());
    expect(accountStore.values).toEqual(saved);
    expect(load).not.toHaveBeenCalled();
    expect(fixture.fetcher).not.toHaveBeenCalled();
  } finally {
    hook.unmount();
    fixture.queryClient.clear();
  }
});
it('withdraws guest requests as capabilities change and restores the account only with account access', async () => {
  const fixture = accountFixture();
  jest.mocked(useRestaurant).mockReturnValue(fixture.state);
  jest.mocked(useBootstrap).mockReturnValue(guestBootstrap as ReturnType<typeof useBootstrap>);
  await accountRepository.activate(fixture.context, session, () => true);
  const hook = renderHook(() => useSession(), { wrapper: fixture.Wrapper });
  try {
    await waitFor(() => expect(hook.result.current.controller).toBeDefined());
    const guest = hook.result.current.controller!.captureRequestOwner({
      kind: 'guest',
      id: 'basket',
    });
    jest.mocked(useBootstrap).mockReturnValue(accountBootstrap as ReturnType<typeof useBootstrap>);
    await act(async () => {
      hook.rerender(undefined);
    });
    await waitFor(() => expect(hook.result.current.userId).toBe(session.userId));
    expect(hook.result.current.unavailable).toBe(false);
    expect(guest).toThrow();
    const account = hook.result.current.controller!;
    jest.mocked(useBootstrap).mockReturnValue(guestBootstrap as ReturnType<typeof useBootstrap>);
    await act(async () => {
      hook.rerender(undefined);
    });
    await waitFor(() => expect(hook.result.current.controller).toBeDefined());
    expect(hook.result.current.userId).toBeNull();
    expect(hook.result.current.unavailable).toBe(true);
    expect(() => account.captureRequestOwner({ kind: 'customer', id: session.userId })).toThrow();
  } finally {
    hook.unmount();
    fixture.queryClient.clear();
  }
});
it('dispatches guest basket reads without the saved customer JWT when accounts are disabled', async () => {
  const fixture = accountFixture();
  jest.mocked(useRestaurant).mockReturnValue(fixture.state);
  jest.mocked(useBootstrap).mockReturnValue(guestBootstrap as ReturnType<typeof useBootstrap>);
  await accountRepository.activate(fixture.context, session, () => true);
  const principal = { kind: 'guest', id: 'basket' } as const;
  const basketSession = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await accountRepository.vault.saveCapability(
    fixture.context,
    'guest-session',
    principal,
    basketSession,
  );
  fixture.fetcher.mockResolvedValueOnce(response({ success: true, data: 'owned' }));
  const hook = renderHook(() => useSession(), { wrapper: fixture.Wrapper });
  try {
    await waitFor(() => expect(hook.result.current.controller).toBeDefined());
    const assertCurrent = hook.result.current.controller!.captureRequestOwner(principal);
    await expect(
      fixture.state.client.request(fixture.context, '/api/Basket', z.string(), {
        credentials: 'basket',
        principal,
        assertCurrent,
      }),
    ).resolves.toBe('owned');
    expect(fixture.fetcher.mock.calls[0]?.[1].headers?.['X-Session-Id']).toBe(basketSession);
    expect(fixture.fetcher.mock.calls[0]?.[1].headers).not.toHaveProperty('Authorization');
    expect(await accountRepository.vault.session(fixture.context, session.userId)).toEqual(session);
  } finally {
    hook.unmount();
    fixture.queryClient.clear();
  }
});
it.each(['disabled', 'read-only'] as const)(
  'never creates a guest controller for lifecycle %s',
  async (lifecycle) => {
    const fixture = accountFixture();
    jest.mocked(useRestaurant).mockReturnValue(fixture.state);
    jest.mocked(useBootstrap).mockReturnValue({
      ...guestBootstrap,
      data: { ...guestBootstrap.data, lifecycle },
    } as ReturnType<typeof useBootstrap>);
    const load = jest.spyOn(accountRepository, 'load');
    const hook = renderHook(() => useSession(), { wrapper: fixture.Wrapper });
    try {
      expect(hook.result.current.controller).toBeUndefined();
      expect(hook.result.current.unavailable).toBe(true);
      expect(load).not.toHaveBeenCalled();
    } finally {
      hook.unmount();
      fixture.queryClient.clear();
    }
  },
);
