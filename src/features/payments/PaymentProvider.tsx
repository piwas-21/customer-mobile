import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PaymentView, CustomerPaymentController } from '../../core/customerPaymentController';
import usePaymentResource from './usePaymentResource';
const PENDING_REFRESH_MS = 30_000;
type PaymentState = {
  value: PaymentView | null | undefined;
  loading: boolean;
  failed: boolean;
  busy: boolean;
  refresh: () => void;
  open: () => void;
};
const PaymentContext = createContext<PaymentState | undefined>(undefined);
export default function PaymentProvider({ children }: Readonly<PropsWithChildren>) {
  const { controller, key } = usePaymentResource();
  const cache = useQueryClient();
  const { i18n } = useTranslation();
  const active = useRef<CustomerPaymentController | undefined>(undefined);
  const [busy, setBusy] = useState<CustomerPaymentController>();
  const [failed, setFailed] = useState<CustomerPaymentController>();
  function refreshPurchaseState(result: PaymentView | null) {
    if (result && result.state !== 'pending')
      void cache.invalidateQueries({
        queryKey: key.slice(0, 3),
        predicate: (q) =>
          q.queryKey.includes('unresolved-purchase') || q.queryKey[3] === 'receipts',
      });
  }
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const result = await controller!.recover(i18n.language);
      controller!.assertCurrent();
      refreshPurchaseState(result);
      return result;
    },
    enabled: Boolean(controller),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: (q) => (q.state.data?.state === 'pending' ? PENDING_REFRESH_MS : false),
  });
  const { refetch } = query;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && controller) void refetch();
    });
    return () => subscription.remove();
  }, [controller, refetch]);
  useEffect(
    () => () => {
      void cache.cancelQueries({ queryKey: key });
      cache.removeQueries({ queryKey: key });
    },
    [cache, key],
  );
  async function open() {
    if (!controller || active.current === controller) return;
    active.current = controller;
    setBusy(controller);
    setFailed(undefined);
    try {
      const result = await controller.open(i18n.language);
      controller.assertCurrent();
      cache.setQueryData(key, result);
      refreshPurchaseState(result);
    } catch {
      try {
        controller.assertCurrent();
        setFailed(controller);
        void refetch();
      } catch {
        /* Withdrawn owner. */
      }
    } finally {
      if (active.current === controller) active.current = undefined;
      setBusy((previous) => (previous === controller ? undefined : previous));
    }
  }
  return (
    <PaymentContext.Provider
      value={{
        value: controller && !query.isError ? query.data : undefined,
        loading: Boolean(controller && query.isPending),
        failed: Boolean(controller && (query.isError || failed === controller)),
        busy: Boolean(controller && busy === controller),
        refresh: () => {
          if (controller) void refetch();
        },
        open: () => {
          void open();
        },
      }}
    >
      {children}
    </PaymentContext.Provider>
  );
}
export function usePayment() {
  const state = useContext(PaymentContext);
  if (!state) throw new Error('PaymentProvider is required');
  return state;
}
