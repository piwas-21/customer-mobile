import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Directory } from '../../core/directory';
import { reconcilePublicMenus } from '../../storage/publicMenuCache';

export function usePublicMenuRetention(directory: Directory | undefined, updatedAt: number) {
  const client = useQueryClient();
  useEffect(() => {
    if (!directory) return;
    const invalidate = () =>
      client
        .invalidateQueries({ queryKey: ['public', directory.environment, 'saved-menu-previews'] })
        .catch(() => undefined);
    const reconcile = async () => {
      let started = false;
      try {
        // Install the fence before refreshing previews; keep disk rejection inside this handler.
        const cleanup = reconcilePublicMenus(directory);
        started = true;
        await Promise.all([invalidate(), cleanup]);
      } catch {
        // A failed cleanup keeps its fence and retries on the next fresh directory fetch.
      }
      if (started) await invalidate();
    };
    void reconcile();
  }, [client, directory, updatedAt]);
}
