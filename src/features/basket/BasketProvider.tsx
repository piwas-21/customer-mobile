import useCustomerOrder from './useCustomerOrder';
import type { CheckoutIntent } from '../../api/checkoutIntent';
import { createContext, type PropsWithChildren, useContext, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { BasketChannelInput } from '../../api/basketChannel';
import type { OrderType } from '../../api/orderType';
import type { BasketItemMutation } from '../../api/basketItemMutation';
import { runBasketCommand, type BasketCommand } from './basketCommands';
import type { BasketAddInput } from '../../api/basketRequest';
import type { BasketWorkspace } from '../../core/basketWorkspace';
import { ApiFailure } from '../../core/transport';
import { canUse } from '../../core/capabilities';
import useMounted from '../../core/useMounted';
import useBootstrap from '../restaurant/useBootstrap';
import useBasketScope from './useBasketScope';
function useBasketState() {
  const { workspace, orders, key, revision, recoveryOnly, sessionController } = useBasketScope();
  const cache = useQueryClient();
  const mounted = useMounted();
  const { i18n } = useTranslation();
  const locale = i18n.language;
  const bootstrap = useBootstrap();
  const ordering = !recoveryOnly && canUse(bootstrap.data, 'ordering');
  const active = useRef<BasketWorkspace | undefined>(undefined);
  const [busyScope, setBusyScope] = useState<BasketWorkspace>();
  const [failureScope, setFailureScope] = useState<BasketWorkspace>();
  const [resolution, setResolution] = useState<{
    owner: BasketWorkspace;
    outcome: 'Applied' | 'Cancelled';
  }>();
  const order = useCustomerOrder(orders, workspace, key, revision.at(-1), active);
  const busy = Boolean(workspace && busyScope === workspace) || order.busy;
  const failure = Boolean(workspace && failureScope === workspace);
  const pendingKey = [...key, 'pending'] as const;
  const pending = useQuery({
    queryKey: pendingKey,
    queryFn: () => workspace!.pendingChange(),
    enabled: Boolean(workspace),
    retry: false,
    staleTime: Infinity,
  });
  const basket = useQuery({
    queryKey: [...key, 'value', locale],
    queryFn: () => workspace!.read(locale),
    enabled: Boolean(workspace && ordering && pending.isSuccess),
    retry: false,
    staleTime: 30_000,
  });
  const ready = Boolean(
    workspace &&
    ordering &&
    pending.isSuccess &&
    pending.data === null &&
    order.ready &&
    basket.isSuccess &&
    !busy,
  );
  async function restoreAfterFailure(owner: BasketWorkspace): Promise<void> {
    try {
      const unresolved = await owner.pendingChange();
      owner.assertCurrent();
      if (mounted.current) {
        cache.setQueryData(pendingKey, unresolved);
        setFailureScope(owner);
      }
    } catch {
      // Withdrawn owners cannot recreate old cache entries or affect a new owner.
      try {
        owner.assertCurrent();
        if (mounted.current) {
          setFailureScope(owner);
          cache.removeQueries({ queryKey: pendingKey, exact: true });
        }
      } catch {
        /* Ownership has changed; leave the new owner untouched. */
      }
    }
  }
  async function submit(command: BasketCommand): Promise<void> {
    const creates =
      command.kind === 'add' || command.kind === 'mutate' || command.kind === 'channel';
    const unresolved = pending.data !== null && pending.data !== undefined;
    if (
      !workspace ||
      active.current === workspace ||
      !pending.isSuccess ||
      (creates && !ready) ||
      (!creates && !unresolved) ||
      (command.kind === 'recover' && pending.data?.cancelling)
    )
      throw new ApiFailure(409, 'refused');
    active.current = workspace;
    setBusyScope(workspace);
    setFailureScope(undefined);
    setResolution(undefined);
    try {
      const result = await runBasketCommand(workspace, command, locale);
      await cache.cancelQueries({ queryKey: key });
      workspace.assertCurrent();
      if (!mounted.current) throw new ApiFailure(0, 'refused');
      cache.setQueryData(pendingKey, null);
      if (result.outcome) setResolution({ owner: workspace, outcome: result.outcome });
      if (result.basket !== null) {
        cache.setQueryData([...key, 'value', locale], result.basket);
        // Locale variants contain the same financial revision. Withdraw their old quotes and
        // refetch whichever other locale is active without retrying an accepted write.
        void cache
          .resetQueries({
            queryKey: [...key, 'value'],
            predicate: (query) => query.queryKey.at(-1) !== locale,
          })
          .catch(() => undefined);
      } else {
        // A cancellation proof is already accepted. Hide the old quote while reading the current
        // basket; a read failure must not turn that successful decision into another cancellation.
        void cache.resetQueries({ queryKey: [...key, 'value'] }).catch(() => undefined);
      }
    } catch (error) {
      await restoreAfterFailure(workspace);
      throw error;
    } finally {
      if (active.current === workspace) active.current = undefined;
      if (mounted.current)
        setBusyScope((previous) => (previous === workspace ? undefined : previous));
    }
  }
  const canContinueAsGuest = Boolean(
    canUse(bootstrap.data, 'ordering') &&
    !busy &&
    sessionController &&
    (sessionController.needsCleanup ||
      (sessionController.onlyRecoverOrders &&
        sessionController.userId &&
        order.pending === null &&
        !order.hasUnresolvedPurchase &&
        order.decision &&
        order.decision.outcome !== 'Unseen')),
  );
  return {
    canContinueAsGuest,
    continueAsGuest: async () => {
      if (!canContinueAsGuest || !sessionController) throw new ApiFailure(409, 'refused');
      if (!sessionController.needsCleanup) {
        if (!orders) throw new ApiFailure(409, 'refused');
        orders.assertCurrent();
        if (await orders.hasUnresolvedPurchase()) throw new ApiFailure(409, 'refused');
      }
      await sessionController.logout();
    },
    basket: workspace && ordering ? basket.data : undefined,
    loading: Boolean(
      workspace && (pending.isPending || order.loading || (ordering && basket.isPending)),
    ),
    unavailable: !workspace || !ordering,
    revision,
    hasPending: pending.isSuccess && pending.data !== null,
    cancelling: pending.data?.cancelling === true,
    resolution: resolution && resolution.owner === workspace ? resolution.outcome : null,
    canAdd: ready,
    canRedeemPoints: Boolean(
      ready && sessionController?.userId && !recoveryOnly && canUse(bootstrap.data, 'loyalty'),
    ),
    failed: failure || pending.isError || basket.isError || order.failed,
    pendingOrder: order.pending ?? null,
    orderDecision: order.decision,
    recoverOrder: () => order.recover(locale),
    cancelOrder: () => order.cancel(locale),
    placeOrder: async (intent: CheckoutIntent) => {
      if (!workspace || !ready || !basket.data || !bootstrap.data)
        throw new ApiFailure(409, 'refused');
      return order.place({
        reviewed: basket.data,
        bootstrap: bootstrap.data,
        intent,
        locale,
        tip: intent.review.tip,
        pointsToRedeem: intent.review.pointsToRedeem,
      });
    },
    busy,
    add: (input: BasketAddInput) => submit({ kind: 'add', input }),
    mutate: (input: BasketItemMutation) => submit({ kind: 'mutate', input }),
    changeChannel: (input: BasketChannelInput) => submit({ kind: 'channel', input }),
    quote: async (selection: Readonly<{ pointsToRedeem: number; tip: number }>) => {
      if (!workspace || !ready || active.current === workspace || !basket.data || !bootstrap.data)
        throw new ApiFailure(409, 'refused');
      return workspace.quote(basket.data, bootstrap.data, selection, locale);
    },
    previewChannel: async (orderType: OrderType) => {
      if (!workspace || !ready || active.current === workspace)
        throw new ApiFailure(409, 'refused');
      return workspace.previewChannel(basket.data ?? null, orderType, locale);
    },
    recover: () => submit({ kind: 'recover' }),
    cancel: () => submit({ kind: 'cancel' }),
    refresh: async () => {
      const owner = workspace;
      if (!owner) return;
      try {
        if ((await pending.refetch()).isError || (await order.refresh()).isError) return;
        if (ordering && (await basket.refetch()).isError) return;
        owner.assertCurrent();
        if (mounted.current)
          setFailureScope((previous) => (previous === owner ? undefined : previous));
      } catch {
        // A withdrawn owner cannot clear another workspace's error.
      }
    },
  };
}
type BasketState = ReturnType<typeof useBasketState>;
const BasketContext = createContext<BasketState | undefined>(undefined);
export default function BasketProvider({ children }: Readonly<PropsWithChildren>) {
  const value = useBasketState();
  return <BasketContext.Provider value={value}>{children}</BasketContext.Provider>;
}
export function useBasket(): BasketState {
  const value = useContext(BasketContext);
  if (!value) throw new Error('BasketProvider is required');
  return value;
}
