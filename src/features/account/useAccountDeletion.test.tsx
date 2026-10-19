import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import useAccountDeletion from './useAccountDeletion';
import { sessionSetup } from '../../test/sessions';
import { tenantA } from '../../test/fixtures';
import { response } from '../../test/transport';
import { deferred } from '../../test/deferred';
import '../../i18n';
beforeEach(() => {
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
});
afterEach(() => jest.restoreAllMocks());
const notRequested = { schemaVersion: 1, state: 'not-requested', scheduledAtUtc: null };
const scheduled = { schemaVersion: 1, state: 'scheduled', scheduledAtUtc: '2026-11-18T13:20:00Z' };
it('serializes synchronous double decisions and requires status recovery before another decision', async () => {
  const fixture = await sessionSetup();
  fixture.fetcher.mockResolvedValue(response({ success: true, data: notRequested }));
  const hook = renderHook(() => useAccountDeletion(fixture.controller, tenantA));
  const finish = deferred<Response>();
  try {
    await waitFor(() => expect(hook.result.current.status?.state).toBe('not-requested'));
    fixture.fetcher.mockReturnValueOnce(finish.promise);
    let pending = Promise.resolve();
    await act(async () => {
      pending = hook.result.current.request();
      await hook.result.current.request();
      await hook.result.current.check();
    });
    expect(fixture.fetcher).toHaveBeenCalledTimes(2);
    finish.resolve(response({}, 503));
    await act(async () => {
      await pending;
    });
    expect(hook.result.current.failure).toBe('unknown');
    await act(async () => {
      await hook.result.current.request();
    });
    expect(fixture.fetcher).toHaveBeenCalledTimes(2);
    await act(async () => {
      await hook.result.current.check();
    });
    expect(hook.result.current.status?.state).toBe('not-requested');
    expect(hook.result.current.failure).toBeUndefined();
    fixture.fetcher.mockResolvedValueOnce(response({ success: true, data: scheduled }));
    await act(async () => {
      await hook.result.current.request();
    });
    expect(hook.result.current.status?.state).toBe('scheduled');
    await act(async () => {
      await hook.result.current.request();
    });
    expect(fixture.fetcher.mock.calls.map(([, options]) => options.method)).toEqual([
      'GET',
      'POST',
      'GET',
      'POST',
    ]);
  } finally {
    finish.resolve(response({}, 503));
    hook.unmount();
  }
});
it('rechecks on foreground and removes the subscription on dismissal', async () => {
  const fixture = await sessionSetup();
  fixture.fetcher.mockResolvedValue(response({ success: true, data: scheduled }));
  const remove = jest.fn();
  const events = jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove });
  const hook = renderHook(() => useAccountDeletion(fixture.controller, tenantA));
  try {
    await waitFor(() => expect(hook.result.current.status?.state).toBe('scheduled'));
    const changed = events.mock.calls[0]?.[1];
    await act(async () => {
      changed?.('background');
    });
    expect(fixture.fetcher).toHaveBeenCalledTimes(1);
    fixture.fetcher.mockResolvedValueOnce(response({ success: true, data: notRequested }));
    await act(async () => {
      changed?.('active');
    });
    await waitFor(() => expect(hook.result.current.status?.state).toBe('not-requested'));
  } finally {
    hook.unmount();
    events.mockRestore();
  }
  expect(remove).toHaveBeenCalledTimes(1);
});
it('does not offer a write while the initial status read is unavailable', async () => {
  const fixture = await sessionSetup();
  fixture.fetcher.mockResolvedValue(response({}, 503));
  const hook = renderHook(() => useAccountDeletion(fixture.controller, tenantA));
  try {
    await waitFor(() => expect(hook.result.current.failure).toBe('read'));
    await act(async () => {
      await hook.result.current.request();
    });
    expect(fixture.fetcher).toHaveBeenCalledTimes(1);
    expect(hook.result.current.status).toBeUndefined();
  } finally {
    hook.unmount();
  }
});
it.each([true, false])('discards a late %s decision response after unmount', async (success) => {
  const fixture = await sessionSetup();
  fixture.fetcher.mockResolvedValue(response({ success: true, data: notRequested }));
  const hook = renderHook(() => useAccountDeletion(fixture.controller, tenantA));
  const finish = deferred<Response>();
  await waitFor(() => expect(hook.result.current.status?.state).toBe('not-requested'));
  fixture.fetcher.mockReturnValueOnce(finish.promise);
  let pending = Promise.resolve();
  await act(async () => {
    pending = hook.result.current.request();
  });
  hook.unmount();
  finish.resolve(success ? response({ success: true, data: scheduled }) : response({}, 503));
  await act(async () => {
    await pending;
  });
  expect(hook.result.current.status).toBeUndefined();
  expect(hook.result.current.failure).toBeUndefined();
});
