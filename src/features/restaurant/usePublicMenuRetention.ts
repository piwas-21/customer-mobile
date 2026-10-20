import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Directory } from '../../core/directory';
import { reconcilePublicMenus } from '../../storage/publicMenuCache';

export function usePublicMenuRetention(directory: Directory | undefined, updatedAt: number) {
  const client = useQueryClient();
  useEffect(() => {
    if (!directory) return;
    let cleanup: Promise<void>;
    try {
      cleanup = reconcilePublicMenus(directory);
    } catch {
      // An expired or malformed observation cannot retire a restaurant.
      return;
    }
    const invalidate = () =>
      client
        .invalidateQueries({ queryKey: ['public', directory.environment, 'saved-menu-previews'] })
        .catch(() => undefined);
    // Re-read through the synchronous retention fence even while disk cleanup is waiting.
    void invalidate();
    // A failed cleanup keeps that fence and retries on the next directory fetch.
    void cleanup.then(invalidate, invalidate);
  }, [client, directory, updatedAt]);
}
