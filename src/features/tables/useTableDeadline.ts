import { useEffect } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { TableVisitController, TableVisitView } from '../../core/tableVisitController';
const MAX_DEADLINE_CHECK_MS = 60_000;
// Expiry withdraws the private display, not the original secure capability or local leave action.
export default function useTableDeadline(
  controller: TableVisitController | undefined,
  view: TableVisitView | null | undefined,
  key: QueryKey,
) {
  const cache = useQueryClient();
  useEffect(() => {
    if (!controller || !view) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      try {
        controller.assertCurrent();
      } catch {
        return;
      }
      const accessKey = [...key, 'access'];
      if (cache.getQueryData(accessKey) !== view) return;
      const remaining = Date.parse(view.expiresAt) - Date.now();
      if (!view.expired && remaining > 0) {
        timer = setTimeout(check, Math.min(remaining, MAX_DEADLINE_CHECK_MS));
        return;
      }
      const accountKey = [...key, 'account'];
      void cache.cancelQueries({ queryKey: accountKey });
      cache.removeQueries({ queryKey: accountKey });
      if (!view.expired) cache.setQueryData(accessKey, { ...view, expired: true });
    };
    check();
    return () => clearTimeout(timer);
  }, [controller, view, key, cache]);
  return view;
}
