import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { tableAdmissionInbox } from '../../core/tableAdmissionInbox';
import type { TableVisitController, TableVisitView } from '../../core/tableVisitController';
import { ApiFailure } from '../../core/apiFailure';
import useMounted from '../../core/useMounted';
import { canUse } from '../../core/capabilities';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
import useTableResource from './useTableResource';
import useTableDeadline from './useTableDeadline';
export default function useTableVisit() {
  const { controller, key, loading, unavailable, allowPaymentReads } = useTableResource();
  const { context } = useRestaurant();
  const bootstrap = useBootstrap().data;
  const { i18n } = useTranslation();
  const cache = useQueryClient();
  const mounted = useMounted();
  const active = useRef<TableVisitController | undefined>(undefined);
  const [busyOwner, setBusyOwner] = useState<TableVisitController>();
  const [failedOwner, setFailedOwner] = useState<TableVisitController>();
  const received = useSyncExternalStore(
    tableAdmissionInbox.subscribe,
    tableAdmissionInbox.snapshot,
  );
  const allowed = canUse(bootstrap, 'table-visits') && bootstrap?.flags.tableGuestVisitsV1 === true;
  const reviewScope = useMemo(
    () => ({ controller, context, received, allowed }),
    [controller, context, received, allowed],
  );
  const [review, setReview] = useState<{ scope: typeof reviewScope; reviewId: string }>();
  const accessKey = [...key, 'access'];
  const access = useQuery({
    queryKey: accessKey,
    queryFn: () => controller!.saved(),
    enabled: Boolean(controller),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const value = useTableDeadline(
    controller,
    controller && !access.isError ? access.data : undefined,
    key,
  );
  const busy = Boolean(controller && busyOwner === controller);
  const accountKey = [...key, 'account', value?.serviceSessionId, i18n.language];
  const account = useQuery({
    queryKey: accountKey,
    queryFn: () => controller!.account(i18n.language),
    enabled: Boolean(controller && allowed && value && !value.expired && !busy),
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  useEffect(
    () => () => {
      void cache.cancelQueries({ queryKey: key });
      cache.removeQueries({ queryKey: key });
    },
    [cache, key],
  );
  useLayoutEffect(() => {
    if (!controller || !context || !allowed) return;
    const qr = tableAdmissionInbox.take(context.tenant.id);
    if (!qr) return;
    let current = true;
    void controller
      .prepare(qr)
      .then((candidate) => {
        controller.assertCurrent();
        if (current) setReview({ scope: reviewScope, reviewId: candidate.reviewId });
      })
      .catch(() => {
        if (current) setFailedOwner(controller);
      });
    return () => {
      current = false;
      controller.invalidateReview();
    };
  }, [received, controller, context, allowed, reviewScope]);
  const run = useCallback(
    async (action: (actor: TableVisitController) => Promise<TableVisitView | null>) => {
      if (!controller || active.current === controller) return;
      active.current = controller;
      setBusyOwner(controller);
      setFailedOwner(undefined);
      try {
        await cache.cancelQueries({ queryKey: key });
        controller.assertCurrent();
        const result = await action(controller);
        controller.assertCurrent();
        if (mounted.current) {
          cache.setQueryData([...key, 'access'], result);
          cache.removeQueries({ queryKey: [...key, 'account'] });
        }
      } catch {
        try {
          const saved = await controller.saved();
          controller.assertCurrent();
          if (mounted.current) {
            cache.setQueryData([...key, 'access'], saved);
            setFailedOwner(controller);
          }
        } catch {
          /* Withdrawn or unreadable authority cannot publish private state. */
        }
      } finally {
        if (active.current === controller) active.current = undefined;
        if (mounted.current) setBusyOwner((owner) => (owner === controller ? undefined : owner));
      }
    },
    [controller, cache, key, mounted],
  );
  const currentReview = controller && review?.scope === reviewScope ? review : undefined;
  const paymentAccount = useCallback(
    (guard: () => void) => {
      if (!controller) throw new ApiFailure(409, 'refused');
      return controller.paymentAccount(i18n.language, guard);
    },
    [controller, i18n.language],
  );
  return {
    allowed,
    scope: key,
    value,
    busy,
    review: currentReview,
    loading: loading || Boolean(controller && access.isFetching),
    failed:
      unavailable ||
      (!controller && !loading) ||
      Boolean(controller && (failedOwner === controller || access.isError)),
    account:
      allowed &&
      value &&
      !value.expired &&
      !busy &&
      !account.isFetching &&
      !account.isError &&
      account.data?.serviceSessionId === value.serviceSessionId
        ? account.data
        : undefined,
    accountLoading: account.isFetching,
    accountFailed: account.isError,
    paymentAccount:
      allowed && allowPaymentReads && bootstrap?.flags.tableAccountPaymentsV1 === true
        ? paymentAccount
        : undefined,
    dismissReview: () => {
      if (currentReview) controller?.dismiss(currentReview.reviewId);
      setReview(undefined);
    },
    confirmReview: () => {
      if (!currentReview) return;
      const id = currentReview.reviewId;
      setReview(undefined);
      void run((actor) => actor.confirm(id, i18n.language));
    },
    leave: (id: string) => run((actor) => actor.leave(id)),
    refresh: () => {
      setFailedOwner(undefined);
      void access.refetch();
      if (allowed && value && !value.expired) void account.refetch();
    },
  };
}
