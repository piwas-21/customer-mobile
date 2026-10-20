import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { fixtureDirectory } from '../../test/fixtures';
import { deferred } from '../../test/deferred';
import { reconcilePublicMenus } from '../../storage/publicMenuCache';
import { usePublicMenuRetention } from './usePublicMenuRetention';
jest.mock('../../storage/publicMenuCache', () => ({ reconcilePublicMenus: jest.fn() }));
it.each([false, true])(
  'refreshes saved previews during and after cleanup, including failure=%s',
  async (fails) => {
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue();
    const pending = deferred<void>();
    jest.mocked(reconcilePublicMenus).mockReturnValue(pending.promise);
    const directory = fixtureDirectory();
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const screen = renderHook<void, { updatedAt: number }>(
      ({ updatedAt }) => usePublicMenuRetention(directory, updatedAt),
      {
        wrapper,
        initialProps: { updatedAt: 1 },
      },
    );
    expect(reconcilePublicMenus).toHaveBeenCalledWith(directory);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenLastCalledWith({
      queryKey: ['public', 'staging', 'saved-menu-previews'],
    });
    await act(async () => {
      if (fails) pending.reject(new Error('disk unavailable'));
      else pending.resolve();
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
    jest.mocked(reconcilePublicMenus).mockResolvedValue();
    screen.rerender({ updatedAt: 2 });
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(4));
    screen.unmount();
    client.clear();
  },
);
it('does not change saved previews when no trusted fresh directory can be reconciled', () => {
  const client = new QueryClient();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  jest.mocked(reconcilePublicMenus).mockImplementation(() => {
    throw new Error('expired');
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const directory = fixtureDirectory();
  const screen = renderHook<void, { available: boolean }>(
    ({ available }) => usePublicMenuRetention(available ? directory : undefined, 1),
    {
      wrapper,
      initialProps: { available: false },
    },
  );
  expect(reconcilePublicMenus).not.toHaveBeenCalled();
  screen.rerender({ available: true });
  expect(reconcilePublicMenus).toHaveBeenCalledWith(directory);
  expect(invalidate).not.toHaveBeenCalled();
  screen.unmount();
  client.clear();
});
