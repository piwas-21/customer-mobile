import { StrictMode, type PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { SessionRepository } from '../../core/sessionRepository';
import { randomUUID } from 'expo-crypto';
import { useBasket } from './BasketProvider';
import { useSession } from '../account/SessionProvider';
import { basketWorkspaceFixture } from '../../test/basketWorkspace';
import { basketInput } from '../../test/basketOperations';
import { response } from '../../test/transport';
import { basketResponse } from '../../test/basketApi';
import { session } from '../../test/sessions';
let mockRepository: SessionRepository;
jest.mock('../../storage/sessions', () => ({
  get deviceSessions() {
    return mockRepository;
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../account/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../restaurant/useBootstrap', () => ({ __esModule: true, default: jest.fn() }));
it('withdraws a late customer add and gives the new guest its own unlocked workspace', async () => {
  const f = await basketWorkspaceFixture(true);
  mockRepository = f.repository;
  jest.mocked(randomUUID).mockImplementation(f.createId);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.fetcher.mockImplementation(async (url) => {
    if (url.includes('bootstrap')) return response({ success: true, data: f.bootstrap });
    await gate;
    return response({ success: true, data: basketResponse(session.userId) });
  });
  const hook = renderHook(() => useBasket(), { wrapper: f.Wrapper });
  try {
    await waitFor(() => expect(hook.result.current.canAdd).toBe(true));
    let result!: Promise<void>;
    await act(async () => {
      result = hook.result.current.add(basketInput);
    });
    // Register the rejection before withdrawing the owner.
    const rejected = expect(result).rejects.toMatchObject({ reason: 'refused' });
    await waitFor(() =>
      expect(f.fetcher.mock.calls.some(([, request]) => request.method === 'POST')).toBe(true),
    );
    await act(async () => {
      await f.sessions.logout();
      jest
        .mocked(useSession)
        .mockReturnValue({ ...f.state, userId: null, ownerVersion: f.sessions.ownerVersion });
      hook.rerender(undefined);
    });
    await waitFor(() => expect(hook.result.current.canAdd).toBe(true));
    await act(async () => {
      release();
      await rejected;
    });
    expect(hook.result.current.hasPending).toBe(false);
    expect(hook.result.current.failed).toBe(false);
    expect(hook.result.current.basket).toBeNull();
    expect(
      f.cache
        .getQueryCache()
        .findAll()
        .some(({ queryKey }) => queryKey[2] === `customer:${session.userId}`),
    ).toBe(false);
  } finally {
    release();
    hook.unmount();
    f.cache.clear();
  }
});
it('creates a fresh effect-owned workspace after StrictMode cleanup replay', async () => {
  const f = await basketWorkspaceFixture();
  mockRepository = f.repository;
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <StrictMode>
        <f.Wrapper>{children}</f.Wrapper>
      </StrictMode>
    );
  }
  const hook = renderHook(() => useBasket(), { wrapper: Wrapper });
  try {
    await waitFor(() => expect(hook.result.current.canAdd).toBe(true));
    expect(hook.result.current.failed).toBe(false);
    expect(f.fetcher).not.toHaveBeenCalled();
  } finally {
    hook.unmount();
    f.cache.clear();
  }
});
