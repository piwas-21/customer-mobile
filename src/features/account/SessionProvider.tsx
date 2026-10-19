import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SessionController } from '../../core/sessionController';
import { canUse } from '../../core/capabilities';
import { deviceSessions } from '../../storage/sessions';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
type SessionState = Readonly<{
  controller: SessionController | undefined;
  userId: string | null;
  needsCleanup: boolean;
  loading: boolean;
  unavailable: boolean;
  failed: boolean;
  retry: () => void;
}>;
const SessionContext = createContext<SessionState | undefined>(undefined);
export default function SessionProvider({ children }: Readonly<PropsWithChildren>) {
  const { context, client } = useRestaurant();
  const bootstrap = useBootstrap();
  const queryClient = useQueryClient();
  const accountsAvailable = canUse(bootstrap.data, 'accounts');
  const available = accountsAvailable || canUse(bootstrap.data, 'ordering');
  const [attempt, setAttempt] = useState(0);
  const scope = useMemo(
    () => ({ context, client, available, accountsAvailable, attempt }),
    [context, client, available, accountsAvailable, attempt],
  );
  const [restored, setRestored] = useState<{
    scope: typeof scope;
    controller: SessionController;
  }>();
  const [failed, setFailed] = useState<typeof scope>();
  const controller = restored?.scope === scope ? restored.controller : undefined;
  const subscribe = useCallback(
    (listener: () => void) => controller?.subscribe(listener) ?? (() => undefined),
    [controller],
  );
  const snapshot = useCallback(() => controller?.userId ?? null, [controller]);
  const userId = useSyncExternalStore(subscribe, snapshot);
  const cleanupSnapshot = useCallback(() => controller?.needsCleanup ?? false, [controller]);
  const needsCleanup = useSyncExternalStore(subscribe, cleanupSnapshot);
  const retry = useCallback(() => setAttempt((previous) => previous + 1), []);
  useEffect(() => {
    if (!scope.available || !scope.context || !scope.client) return;
    // Each effect owns its controller, including React's development setup/cleanup replay.
    const current = new SessionController(
      scope.context,
      scope.client,
      deviceSessions,
      scope.accountsAvailable,
    );
    let active = true;
    void current
      .initialize()
      .then(() => {
        if (active) setRestored({ scope, controller: current });
      })
      .catch(() => {
        if (active) setFailed(scope);
      });
    return () => {
      active = false;
      current.dispose();
    };
  }, [scope]);
  useEffect(() => {
    if (!context) return;
    // A principal change withdraws only this restaurant's previous private query data.
    queryClient.removeQueries({
      predicate: ({ queryKey }) =>
        queryKey[0] === context.environment &&
        queryKey[1] === context.tenant.id &&
        typeof queryKey[2] === 'string' &&
        queryKey[2].startsWith('customer:') &&
        queryKey[2] !== `customer:${userId}`,
    });
  }, [context, userId, queryClient]);
  const error = failed === scope;
  const value = useMemo<SessionState>(
    () => ({
      controller,
      userId,
      needsCleanup,
      loading: bootstrap.isPending || Boolean(available && !controller && !error),
      unavailable: !accountsAvailable,
      failed: error,
      retry,
    }),
    [
      controller,
      userId,
      needsCleanup,
      bootstrap.isPending,
      error,
      available,
      accountsAvailable,
      retry,
    ],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
export function useSession(): SessionState {
  const state = useContext(SessionContext);
  if (!state) throw new Error('SessionProvider is required');
  return state;
}
