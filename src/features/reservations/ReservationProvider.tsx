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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { CustomerReservationController } from '../../core/customerReservationController';
import type { ReservationAttemptView } from '../../core/reservationAttemptView';
import type { ReservationBookingInput } from '../../api/reservationCreateContract';
import useMounted from '../../core/useMounted';
import useReservationResource from './useReservationResource';
type ReservationState = Readonly<{
  controller: CustomerReservationController | undefined;
  value: ReservationAttemptView | null | undefined;
  busy: boolean;
  loading: boolean;
  failed: boolean;
  create: (input: ReservationBookingInput) => Promise<ReservationAttemptView | null>;
  check: () => Promise<ReservationAttemptView | null>;
  retryOriginal: (operationId: string) => Promise<ReservationAttemptView | null>;
  cancelAttempt: (operationId: string) => Promise<ReservationAttemptView | null>;
  acknowledge: (operationId: string) => Promise<ReservationAttemptView | null>;
  refresh: () => void;
}>;
const ReservationContext = createContext<ReservationState | undefined>(undefined);
export default function ReservationProvider({ children }: Readonly<PropsWithChildren>) {
  const { controller, key } = useReservationResource();
  const { i18n } = useTranslation();
  const cache = useQueryClient();
  const mounted = useMounted();
  const active = useRef<CustomerReservationController | undefined>(undefined);
  const [busy, setBusy] = useState<CustomerReservationController>();
  const [failed, setFailed] = useState<CustomerReservationController>();
  // Mount/foreground restore reads only SecureStore. Checking the server is an explicit action.
  const query = useQuery({
    queryKey: key,
    queryFn: () => controller!.saved(),
    enabled: Boolean(controller),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const { refetch } = query;
  useEffect(
    () => () => {
      void cache.cancelQueries({ queryKey: key });
      cache.removeQueries({ queryKey: key });
    },
    [cache, key],
  );
  const run = useCallback(
    async (
      action: (owner: CustomerReservationController) => Promise<ReservationAttemptView | null>,
    ) => {
      if (!controller || active.current === controller)
        throw new Error('Reservation action is busy');
      active.current = controller;
      setBusy(controller);
      setFailed(undefined);
      try {
        await cache.cancelQueries({ queryKey: key });
        controller.assertCurrent();
        const value = await action(controller);
        controller.assertCurrent();
        if (!mounted.current) return value;
        cache.setQueryData(key, value);
        if (value?.outcome === 'Applied')
          void cache.invalidateQueries({
            queryKey: key.slice(0, 3),
            predicate: (entry) => entry.queryKey.includes('reservation-history'),
          });
        return value;
      } catch (error) {
        try {
          controller.assertCurrent();
          if (mounted.current) {
            setFailed(controller);
            const saved = await controller.saved();
            controller.assertCurrent();
            if (mounted.current) cache.setQueryData(key, saved);
          }
        } catch {
          /* Withdrawal or failed secure read cannot publish stale private state. */
        }
        throw error;
      } finally {
        if (active.current === controller) active.current = undefined;
        if (mounted.current) setBusy((value) => (value === controller ? undefined : value));
      }
    },
    [controller, cache, key, mounted],
  );
  const value = useMemo<ReservationState>(
    () => ({
      controller,
      value: controller && !query.isError ? query.data : undefined,
      busy: Boolean(controller && busy === controller),
      loading: Boolean(controller && query.isFetching),
      failed: Boolean(controller && (failed === controller || query.isError)),
      create: (input) => run((owner) => owner.create(input, i18n.language)),
      check: () => run((owner) => owner.recover(i18n.language)),
      retryOriginal: (operationId) =>
        run((owner) => owner.retryOriginal(operationId, i18n.language)),
      cancelAttempt: (operationId) =>
        run((owner) => owner.cancelAttempt(operationId, i18n.language)),
      acknowledge: (operationId) => run((owner) => owner.acknowledge(operationId)),
      refresh: () => {
        if (controller) {
          setFailed(undefined);
          void refetch();
        }
      },
    }),
    [
      controller,
      query.data,
      query.isError,
      query.isFetching,
      busy,
      failed,
      run,
      i18n.language,
      refetch,
    ],
  );
  return <ReservationContext.Provider value={value}>{children}</ReservationContext.Provider>;
}
export const useReservation = () => useContext(ReservationContext);
