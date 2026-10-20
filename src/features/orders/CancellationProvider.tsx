import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type {
  CancellationView,
  CustomerCancellationController,
} from '../../core/customerCancellationController';
import useCancellationResource from './useCancellationResource';
type CancellationState = {
  controller: CustomerCancellationController | undefined;
  value: CancellationView | null | undefined;
  busy: boolean;
  loading: boolean;
  failed: boolean;
  confirm: (orderId: string) => Promise<CancellationView | null>;
  refresh: () => void;
  retry: (operationId: string) => void;
};
const CancellationContext = createContext<CancellationState | undefined>(undefined);
export default function CancellationProvider({ children }: Readonly<PropsWithChildren>) {
  const { controller, key } = useCancellationResource();
  const { i18n } = useTranslation();
  const cache = useQueryClient();
  const active = useRef<CustomerCancellationController | undefined>(undefined);
  const [busy, setBusy] = useState<CustomerCancellationController>();
  const [failed, setFailed] = useState<CustomerCancellationController>();
  const accepted = useCallback(
    (result: CancellationView | null) => {
      if (result?.outcome === 'Cancelled' || result?.outcome === 'Refused')
        void cache.invalidateQueries({
          queryKey: key.slice(0, 3),
          predicate: (q) => q.queryKey[3] !== 'cancellation',
        });
    },
    [cache, key],
  );
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const value = await controller!.recover(i18n.language);
      controller!.assertCurrent();
      accepted(value);
      setFailed((previous) => (previous === controller ? undefined : previous));
      return value;
    },
    enabled: Boolean(controller),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const { refetch } = query;
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active' && controller) void refetch();
    });
    return () => listener.remove();
  }, [controller, refetch]);
  useEffect(
    () => () => {
      void cache.cancelQueries({ queryKey: key });
      cache.removeQueries({ queryKey: key });
    },
    [cache, key],
  );
  const run = useCallback(
    async (action: (owner: CustomerCancellationController) => Promise<CancellationView | null>) => {
      if (!controller || active.current === controller) throw new Error('Order action is busy');
      active.current = controller;
      setBusy(controller);
      setFailed(undefined);
      try {
        await cache.cancelQueries({ queryKey: key });
        controller.assertCurrent();
        const value = await action(controller);
        controller.assertCurrent();
        cache.setQueryData(key, value);
        accepted(value);
        return value;
      } catch (error) {
        try {
          controller.assertCurrent();
          setFailed(controller);
          void refetch();
        } catch {
          /* Withdrawn owner. */
        }
        throw error;
      } finally {
        if (active.current === controller) active.current = undefined;
        setBusy((value) => (value === controller ? undefined : value));
      }
    },
    [controller, cache, key, accepted, refetch],
  );
  const value = useMemo<CancellationState>(
    () => ({
      controller,
      value: controller && !query.isError ? query.data : undefined,
      busy: Boolean(controller && busy === controller),
      loading: Boolean(controller && query.isFetching),
      failed: Boolean(controller && (failed === controller || query.isError)),
      confirm: (orderId) => run((owner) => owner.confirm(orderId, i18n.language)),
      refresh: () => {
        if (controller) void refetch();
      },
      retry: (operationId) => {
        void run((owner) => owner.retryOriginal(operationId, i18n.language)).catch(() => undefined);
      },
    }),
    [
      controller,
      query.isError,
      query.data,
      query.isFetching,
      busy,
      failed,
      run,
      i18n.language,
      refetch,
    ],
  );
  return <CancellationContext.Provider value={value}>{children}</CancellationContext.Provider>;
}
// An entry outside the customer workspace has no mutation authority.
export const useCancellation = () => useContext(CancellationContext);
