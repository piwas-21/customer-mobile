import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { readCustomerAddresses } from '../../api/customerAddresses';
import type { SessionController } from '../../core/sessionController';
import type { TenantContext } from '../../core/tenantContext';
export default function useSavedAddresses(
  context: TenantContext,
  controller: SessionController,
  userId: string,
  ownerVersion: string,
) {
  const instance = useId();
  const cache = useQueryClient();
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1);
  const scope = useMemo(
    () =>
      [
        context.environment,
        context.tenant.id,
        `customer:${userId}`,
        'saved-addresses',
        context.generation,
        ownerVersion,
        instance,
      ] as const,
    [context, userId, ownerVersion, instance],
  );
  const page = useQuery({
    queryKey: [...scope, cursor],
    queryFn: () => readCustomerAddresses(controller, userId, cursor),
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const { refetch } = page;
  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);
  useEffect(
    () => () => {
      void cache.cancelQueries({ queryKey: scope });
      cache.removeQueries({ queryKey: scope });
    },
    [cache, scope],
  );
  const loading = page.isPending || page.isFetching;
  const data = !loading && !page.isError ? page.data : undefined;
  return {
    items: data?.items ?? [],
    loading,
    failed: page.isError,
    refresh,
    hasNext: Boolean(data?.nextAfterId),
    hasPrevious: cursors.length > 0,
    next: () => {
      const next = data?.nextAfterId;
      if (next)
        setCursors((previous) => (previous.at(-1) === next ? previous : [...previous, next]));
    },
    previous: () => {
      if (!loading) setCursors((previous) => previous.slice(0, -1));
    },
  };
}
