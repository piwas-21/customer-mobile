import { createContext, type PropsWithChildren, useContext, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
  const { workspace, key, revision } = useBasketScope();
  const cache = useQueryClient();
  const mounted = useMounted();
  const { i18n } = useTranslation();
  const locale = i18n.language;
  const bootstrap = useBootstrap();
  const ordering = canUse(bootstrap.data, 'ordering');
  const active = useRef<BasketWorkspace | undefined>(undefined);
  const [busyScope, setBusyScope] = useState<BasketWorkspace>();
  const [failureScope, setFailureScope] = useState<BasketWorkspace>();
  const [resolution, setResolution] = useState<{
    owner: BasketWorkspace;
    outcome: 'Applied' | 'Cancelled';
  }>();
  const busy = Boolean(workspace && busyScope === workspace);
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
    const creates = command.kind === 'add' || command.kind === 'mutate';
    const unresolved = pending.data !== null && pending.data !== undefined;
    if (
      !workspace ||
      active.current === workspace ||
      !pending.isSuccess ||
      (creates && (!ordering || unresolved || !basket.isSuccess)) ||
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
  return {
    basket: workspace && ordering ? basket.data : undefined,
    loading: Boolean(workspace && (pending.isPending || (ordering && basket.isPending))),
    unavailable: !workspace || !ordering,
    revision,
    hasPending: pending.isSuccess && pending.data !== null,
    cancelling: pending.data?.cancelling === true,
    resolution: resolution && resolution.owner === workspace ? resolution.outcome : null,
    canAdd: Boolean(
      workspace &&
      ordering &&
      pending.isSuccess &&
      pending.data === null &&
      basket.isSuccess &&
      !busy,
    ),
    failed: failure || pending.isError || basket.isError,
    busy,
    add: (input: BasketAddInput) => submit({ kind: 'add', input }),
    mutate: (input: BasketItemMutation) => submit({ kind: 'mutate', input }),
    recover: () => submit({ kind: 'recover' }),
    cancel: () => submit({ kind: 'cancel' }),
    refresh: async () => {
      await pending.refetch();
      if (ordering) await basket.refetch();
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
