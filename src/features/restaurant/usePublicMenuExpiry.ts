import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { Environment } from '../../core/directory';
import { prunePublicMenus, subscribePublicMenus } from '../../storage/publicMenuCache';

const CLEANUP_RETRY_MS = 60_000;
export default function usePublicMenuExpiry(environment: Environment | undefined) {
  const client = useQueryClient();
  useEffect(() => {
    if (!environment) return;
    let alive = true;
    let running = false;
    let again = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = async () => {
      clearTimeout(timer);
      if (running) {
        again = true;
        return;
      }
      running = true;
      let next: number | undefined;
      try {
        next = await prunePublicMenus(environment);
      } catch {
        next = Date.now() + CLEANUP_RETRY_MS;
      }
      if (alive) {
        void client
          .invalidateQueries({ queryKey: ['public', environment, 'saved-menu-previews'] })
          .catch(() => undefined);
        if (next !== undefined)
          timer = setTimeout(() => void cleanup(), Math.max(1, next - Date.now()));
      }
      running = false;
      if (again && alive) {
        again = false;
        void cleanup();
      }
    };
    const unsubscribe = subscribePublicMenus((changed) => {
      if (changed === environment) void cleanup();
    });
    const subscription = AppState.addEventListener('change', () => void cleanup());
    void cleanup();
    return () => {
      alive = false;
      unsubscribe();
      subscription.remove();
      clearTimeout(timer);
    };
  }, [client, environment]);
}
