import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { sessionSetup } from '../../test/sessions';
import { customerProfile } from '../../test/customerProfile';
import { response } from '../../test/transport';
import { deferred } from '../../test/deferred';
import useProfileEdit from './useProfileEdit';
import '../../i18n';
async function setup() {
  const fixture = await sessionSetup();
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const key = [
    fixture.context.environment,
    fixture.context.tenant.id,
    `customer:${customerProfile.id}`,
    'profile',
    fixture.context.generation,
  ] as const;
  queryClient.setQueryData(key, customerProfile);
  const saved = jest.fn();
  const cancelled = jest.fn();
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  const hook = renderHook(
    () => useProfileEdit(customerProfile, fixture.controller, key, saved, cancelled),
    { wrapper: Wrapper },
  );
  return {
    ...fixture,
    ...hook,
    queryClient,
    key,
    saved,
    cancelled,
    close: () => {
      hook.unmount();
      queryClient.clear();
    },
  };
}

it('does not restore a private cache or announce success after editor unmount', async () => {
  const fixture = await setup();
  const entered = deferred<void>();
  const finish = deferred<Response>();
  fixture.fetcher.mockImplementation(() => {
    entered.resolve();
    return finish.promise;
  });
  let pending = Promise.resolve();
  try {
    await act(async () => {
      pending = fixture.result.current.save();
      await entered.promise;
    });
    fixture.unmount();
    fixture.queryClient.removeQueries({ queryKey: fixture.key, exact: true });
    finish.resolve(response({ success: true, data: customerProfile }));
    await act(async () => {
      await pending;
    });
    expect(fixture.queryClient.getQueryData(fixture.key)).toBeUndefined();
    expect(fixture.saved).not.toHaveBeenCalled();
  } finally {
    finish.resolve(response({}, 503));
    fixture.queryClient.clear();
  }
});

it('rechecks ownership after awaited cache cancellation before publishing private results', async () => {
  const fixture = await setup();
  const entered = deferred<void>();
  const finish = deferred<void>();
  fixture.fetcher.mockResolvedValue(response({ success: true, data: customerProfile }));
  jest.spyOn(fixture.queryClient, 'cancelQueries').mockImplementation(async () => {
    entered.resolve();
    await finish.promise;
  });
  let pending = Promise.resolve();
  try {
    await act(async () => {
      pending = fixture.result.current.save();
      await entered.promise;
    });
    await fixture.controller.logout();
    fixture.queryClient.removeQueries({ queryKey: fixture.key, exact: true });
    finish.resolve();
    await act(async () => {
      await pending;
    });
    expect(fixture.queryClient.getQueryData(fixture.key)).toBeUndefined();
    expect(fixture.saved).not.toHaveBeenCalled();
    expect(fixture.result.current.failure).toBe('request');
  } finally {
    finish.resolve();
    fixture.close();
  }
});

it('blocks synchronous duplicate saves and cancellation before busy state rerenders', async () => {
  const fixture = await setup();
  const entered = deferred<void>();
  const finish = deferred<Response>();
  fixture.fetcher.mockImplementation(() => {
    entered.resolve();
    return finish.promise;
  });
  let first = Promise.resolve();
  let duplicate = Promise.resolve();
  try {
    await act(async () => {
      first = fixture.result.current.save();
      duplicate = fixture.result.current.save();
      fixture.result.current.cancel();
      await entered.promise;
    });
    expect(fixture.cancelled).not.toHaveBeenCalled();
    expect(fixture.fetcher).toHaveBeenCalledTimes(1);
    finish.resolve(response({ success: true, data: customerProfile }));
    await act(async () => {
      await Promise.all([first, duplicate]);
    });
    expect(fixture.saved).toHaveBeenCalledTimes(1);
    expect(fixture.queryClient.getQueryData(fixture.key)).toEqual(customerProfile);
  } finally {
    finish.resolve(response({}, 503));
    fixture.close();
  }
});
