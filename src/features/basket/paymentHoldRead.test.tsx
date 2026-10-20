import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { basketControllerFixture } from '../../test/basketController';
import { CustomerOrderController } from '../../core/customerOrderController';
import { BasketWorkspace } from '../../core/basketWorkspace';
import { secretKey } from '../../core/credentials';
import useCustomerOrder from './useCustomerOrder';
it.each(['initial', 'refetch'] as const)(
  'withdraws readiness after %s hold read fails and recovers on explicit refresh',
  async (scenario) => {
    const f = await basketControllerFixture();
    const orders = new CustomerOrderController(
      f.context,
      f.client,
      f.repository,
      f.sessions,
      f.principal,
      f.createId,
    );
    const workspace = new BasketWorkspace(
      f.context,
      f.client,
      f.repository,
      f.sessions,
      f.principal,
      f.createId,
    );
    const key = [f.context.environment, f.context.tenant.id, 'guest:basket', 'basket'];
    const active = { current: undefined };
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const original = f.store.get.bind(f.store);
    let fail = scenario === 'initial';
    jest.spyOn(f.store, 'get').mockImplementation(async (key) => {
      if (key === secretKey(f.context, 'payment', f.principal) && fail)
        throw new Error('Secure storage unavailable');
      return original(key);
    });
    function Wrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={cache}>{children}</QueryClientProvider>;
    }
    const hook = renderHook(() => useCustomerOrder(orders, workspace, key, 1, active), {
      wrapper: Wrapper,
    });
    try {
      if (scenario === 'refetch') {
        await waitFor(() => expect(hook.result.current.ready).toBe(true));
        fail = true;
        await act(async () => {
          expect((await hook.result.current.refresh()).isError).toBe(true);
        });
      }
      await waitFor(() => expect(hook.result.current.failed).toBe(true));
      expect(hook.result.current.ready).toBe(false);
      expect(hook.result.current.hasUnresolvedPurchase).toBe(true);
      expect(hook.result.current.loading).toBe(false);
      fail = false;
      await act(async () => {
        expect((await hook.result.current.refresh()).isError).toBe(false);
      });
      await waitFor(() => expect(hook.result.current.ready).toBe(true));
      expect(hook.result.current.failed).toBe(false);
      expect(hook.result.current.hasUnresolvedPurchase).toBe(false);
      expect(f.fetcher).not.toHaveBeenCalled();
    } finally {
      hook.unmount();
      cache.clear();
      jest.restoreAllMocks();
    }
  },
);
