import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import type { Environment } from '../../core/directory';
import { prunePublicMenus, subscribePublicMenus } from '../../storage/publicMenuCache';
import { deferred } from '../../test/deferred';
import usePublicMenuExpiry from './usePublicMenuExpiry';
jest.mock('../../storage/publicMenuCache', () => ({
  prunePublicMenus: jest.fn(),
  subscribePublicMenus: jest.fn(),
}));
function fixture(environment: Environment | undefined = 'staging') {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue();
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => usePublicMenuExpiry(environment), { wrapper });
  return { ...hook, client, invalidate };
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-20T12:00:00Z'));
  jest.mocked(prunePublicMenus).mockResolvedValue(undefined);
  jest.mocked(subscribePublicMenus).mockReturnValue(jest.fn());
});
afterEach(() => jest.useRealTimers());
it('cleans at startup and the earliest expiry without requiring a directory request', async () => {
  jest.mocked(prunePublicMenus).mockResolvedValueOnce(Date.now() + 1000);
  const f = fixture();
  await act(async () => {});
  expect(prunePublicMenus).toHaveBeenCalledWith('staging');
  expect(f.invalidate).toHaveBeenCalledWith({
    queryKey: ['public', 'staging', 'saved-menu-previews'],
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(999);
  });
  expect(prunePublicMenus).toHaveBeenCalledTimes(1);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1);
  });
  expect(prunePublicMenus).toHaveBeenCalledTimes(2);
  f.unmount();
  f.client.clear();
});
it('reschedules newly saved menus and retries after a storage refusal', async () => {
  const f = fixture();
  await act(async () => {});
  const changed = jest.mocked(subscribePublicMenus).mock.calls[0]![0];
  await act(async () => changed('production'));
  expect(prunePublicMenus).toHaveBeenCalledTimes(1);
  jest.mocked(prunePublicMenus).mockRejectedValueOnce(new Error('disk offline'));
  await act(async () => changed('staging'));
  expect(prunePublicMenus).toHaveBeenCalledTimes(2);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(59_999);
  });
  expect(prunePublicMenus).toHaveBeenCalledTimes(2);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1);
  });
  expect(prunePublicMenus).toHaveBeenCalledTimes(3);
  f.unmount();
  f.client.clear();
});
it('coalesces lifecycle/save events and removes subscriptions without scheduling work after unmount', async () => {
  const listener = jest.spyOn(AppState, 'addEventListener');
  const remove = jest.fn();
  listener.mockReturnValue({ remove });
  const pending = deferred<number | undefined>();
  jest.mocked(prunePublicMenus).mockReturnValueOnce(pending.promise);
  const f = fixture();
  const stateChanged = listener.mock.calls[0]![1];
  const changed = jest.mocked(subscribePublicMenus).mock.calls[0]![0];
  await act(async () => {
    stateChanged('background');
    stateChanged('active');
    changed('staging');
  });
  expect(prunePublicMenus).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve(Date.now() + 1000));
  expect(prunePublicMenus).toHaveBeenCalledTimes(2);
  const late = deferred<number | undefined>();
  jest.mocked(prunePublicMenus).mockReturnValueOnce(late.promise);
  await act(async () => stateChanged('inactive'));
  f.unmount();
  const calls = f.invalidate.mock.calls.length;
  await act(async () => late.resolve(Date.now() + 1000));
  await act(async () => {
    await jest.advanceTimersByTimeAsync(2000);
  });
  expect(prunePublicMenus).toHaveBeenCalledTimes(3);
  expect(f.invalidate).toHaveBeenCalledTimes(calls);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(jest.mocked(subscribePublicMenus).mock.results[0]!.value).toHaveBeenCalledTimes(1);
  f.client.clear();
  listener.mockRestore();
});
it('keeps unconfigured builds inert', async () => {
  const client = new QueryClient();
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const f = renderHook(() => usePublicMenuExpiry(undefined), { wrapper });
  await act(async () => {});
  expect(prunePublicMenus).not.toHaveBeenCalled();
  expect(subscribePublicMenus).not.toHaveBeenCalled();
  f.unmount();
  client.clear();
});
