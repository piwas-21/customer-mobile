import { createContext, type PropsWithChildren, useContext, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { BasketAddInput } from '../../api/basketRequest';
import type { BasketWorkspace } from '../../core/basketWorkspace';
import { ApiFailure } from '../../core/transport';
import { canUse } from '../../core/capabilities';
import useMounted from '../../core/useMounted';
import useBootstrap from '../restaurant/useBootstrap';
import useBasketScope from './useBasketScope';
function useBasketState() {
  const { workspace, key } = useBasketScope();
  const cache = useQueryClient();
  const mounted = useMounted();
  const { i18n } = useTranslation();
  const locale = i18n.language;
  const bootstrap = useBootstrap();
  const ordering = canUse(bootstrap.data, 'ordering');
  const active = useRef<BasketWorkspace | undefined>(undefined);
  const [busyScope, setBusyScope] = useState<BasketWorkspace>();
  const [failureScope, setFailureScope] = useState<BasketWorkspace>();
  const busy = Boolean(workspace && busyScope === workspace);
  const failure = Boolean(workspace && failureScope === workspace);
  const pendingKey = [...key, 'pending'] as const;
  const pending = useQuery({
    queryKey: pendingKey,
    queryFn: () => workspace!.hasPending(),
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
  async function submit(input?: BasketAddInput): Promise<void> {
    if (
      !workspace ||
      active.current === workspace ||
      !pending.isSuccess ||
      (input ? !ordering || pending.data : !pending.data)
    )
      throw new ApiFailure(409, 'refused');
    active.current = workspace;
    setBusyScope(workspace);
    setFailureScope(undefined);
    try {
      const result = input ? await workspace.add(input, locale) : await workspace.recover(locale);
      await cache.cancelQueries({ queryKey: key });
      workspace.assertCurrent();
      if (!mounted.current) throw new ApiFailure(0, 'refused');
      cache.setQueryData([...key, 'value', locale], result);
      cache.setQueryData(pendingKey, false);
    } catch (error) {
      try {
        const unresolved = await workspace.hasPending();
        workspace.assertCurrent();
        if (mounted.current) {
          cache.setQueryData(pendingKey, unresolved);
          setFailureScope(workspace);
        }
      } catch {
        // Withdrawn owners cannot recreate old cache entries or affect a new owner.
        try {
          workspace.assertCurrent();
          if (mounted.current) {
            setFailureScope(workspace);
            cache.removeQueries({ queryKey: pendingKey, exact: true });
          }
        } catch {
          /* Ownership has changed; leave the new workspace untouched. */
        }
      }
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
    hasPending: pending.data === true,
    canAdd: Boolean(
      workspace &&
      ordering &&
      pending.isSuccess &&
      pending.data === false &&
      basket.isSuccess &&
      !busy,
    ),
    failed: failure || pending.isError || basket.isError,
    busy,
    add: (input: BasketAddInput) => submit(input),
    recover: () => submit(),
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
