import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TenantContext } from './tenantContext';
export default function usePrivatePages<Cursor, Page>(
  context: TenantContext,
  userId: string,
  ownerVersion: string,
  resource: string,
  read: (cursor?: Cursor) => Promise<Page>,
  nextCursor: (page: Page) => Cursor | null,
) {
  const instance = useId();
  const cache = useQueryClient();
  const scope = useMemo(
    () =>
      [
        context.environment,
        context.tenant.id,
        `customer:${userId}`,
        resource,
        context.generation,
        ownerVersion,
        instance,
      ] as const,
    [context, userId, resource, ownerVersion, instance],
  );
  const [navigation, setNavigation] = useState<{ scope: typeof scope; cursors: Cursor[] }>();
  const cursors = navigation?.scope === scope ? navigation.cursors : [];
  const page = useQuery({
    queryKey: [...scope, cursors.at(-1)],
    queryFn: () => read(cursors.at(-1)),
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
  const next = data ? nextCursor(data) : null;
  return {
    data,
    loading,
    failed: page.isError,
    refresh,
    hasNext: next !== null,
    hasPrevious: cursors.length > 0,
    next: () => {
      if (next !== null) setNavigation({ scope, cursors: [...cursors, next] });
    },
    previous: () => {
      if (!loading) setNavigation({ scope, cursors: cursors.slice(0, -1) });
    },
  };
}
