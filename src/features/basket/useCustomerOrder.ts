import { useRef, useState, type RefObject } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CustomerOrderController } from '../../core/customerOrderController';
import type { BasketWorkspace } from '../../core/basketWorkspace';
import type { CustomerOrderResolution } from '../../api/customerOrderOperation';
import useMounted from '../../core/useMounted';
import { ApiFailure } from '../../core/transport';
export default function useCustomerOrder(
  orders: CustomerOrderController | undefined,
  workspace: BasketWorkspace | undefined,
  key: readonly unknown[],
  version: unknown,
  activeRef: RefObject<BasketWorkspace | undefined>,
) {
  const cache = useQueryClient();
  const mounted = useMounted();
  const request = useRef<CustomerOrderController | undefined>(undefined);
  const [busyOwner, setBusyOwner] = useState<CustomerOrderController>();
  const [failedOwner, setFailedOwner] = useState<CustomerOrderController>();
  const [decision, setDecision] = useState<{
    owner: CustomerOrderController;
    value: CustomerOrderResolution;
  }>();
  const pendingKey = [...key, 'pending-order', version];
  const pending = useQuery({
    queryKey: pendingKey,
    queryFn: () => orders!.pending(),
    enabled: Boolean(orders),
    retry: false,
    staleTime: Infinity,
  });
  const holdKey = [...key, 'unresolved-purchase', version];
  const hold = useQuery({
    queryKey: holdKey,
    queryFn: () => orders!.hasUnresolvedPurchase(),
    enabled: Boolean(orders),
    retry: false,
    staleTime: Infinity,
  });
  async function run(action: () => Promise<CustomerOrderResolution>) {
    if (
      !orders ||
      !workspace ||
      request.current ||
      activeRef.current === workspace ||
      !pending.isSuccess
    )
      throw new ApiFailure(409, 'refused');
    request.current = orders;
    activeRef.current = workspace;
    setBusyOwner(orders);
    setFailedOwner(undefined);
    setDecision(undefined);
    try {
      const result = await action();
      orders.assertCurrent();
      if (!mounted.current) throw new ApiFailure(0, 'refused');
      setDecision({ owner: orders, value: result });
      if (result.outcome !== 'Unseen') {
        cache.setQueryData(pendingKey, null);
        cache.setQueryData(holdKey, true);
        void cache.invalidateQueries({ queryKey: holdKey });
        void cache.invalidateQueries({ queryKey: [...key.slice(0, 3), 'payment'] });
        void cache.resetQueries({ queryKey: [...key, 'value'] }).catch(() => undefined);
      }
      return result;
    } catch (error) {
      try {
        orders.assertCurrent();
        if (mounted.current) {
          setFailedOwner(orders);
          await Promise.all([pending.refetch(), hold.refetch()]);
          orders.assertCurrent();
        }
      } catch {
        cache.removeQueries({ queryKey: pendingKey, exact: true });
      }
      throw error;
    } finally {
      if (request.current === orders) request.current = undefined;
      if (activeRef.current === workspace) activeRef.current = undefined;
      if (mounted.current) setBusyOwner((value) => (value === orders ? undefined : value));
    }
  }
  return {
    ready: Boolean(
      orders && pending.isSuccess && pending.data === null && hold.isSuccess && hold.data === false,
    ),
    hasUnresolvedPurchase: !hold.isSuccess || hold.data !== false,
    loading: Boolean(orders && (pending.isPending || hold.isPending)),
    pending: pending.isSuccess ? pending.data : undefined,
    busy: Boolean(orders && busyOwner === orders),
    failed: Boolean(orders && (failedOwner === orders || pending.isError || hold.isError)),
    decision: orders && decision?.owner === orders ? decision.value : null,
    place: (input: Parameters<CustomerOrderController['submit']>[0]) =>
      run(() => orders!.submit(input)),
    recover: (locale: string) => run(() => orders!.recover(locale)),
    cancel: (locale: string) => run(() => orders!.cancel(locale)),
    refresh: async () => {
      const [result, purchase] = await Promise.all([pending.refetch(), hold.refetch()]);
      orders?.assertCurrent();
      if (!result.isError && !purchase.isError && mounted.current)
        setFailedOwner((value) => (value === orders ? undefined : value));
      return { isError: result.isError || purchase.isError };
    },
  };
}
