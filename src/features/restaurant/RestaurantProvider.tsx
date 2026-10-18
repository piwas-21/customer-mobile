import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { runtimeConfig } from '../../config';
import { parseDirectory, type Directory } from '../../core/directory';
import { fetchDirectory, CustomerTransport } from '../../core/transport';
import { CredentialVault } from '../../core/credentials';
import { TenantBoundary, type TenantContext } from '../../core/tenantContext';
import { deviceSecrets } from '../../storage/secrets';
import { readPreferences, savePreferences } from '../../storage/publicPreferences';
type RestaurantState = {
  directory: Directory | undefined;
  context: TenantContext | undefined;
  client: CustomerTransport | undefined;
  loading: boolean;
  select: (id: string) => boolean;
  refresh: () => void;
  clear: () => void;
};
const RestaurantContext = createContext<RestaurantState | undefined>(undefined);
const REFRESH_INTERVAL_MS = 30_000;
export default function RestaurantProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const boundary = useRef<TenantBoundary | undefined>(undefined);
  const [expiredDirectory, setExpiredDirectory] = useState<Directory>();
  const [context, setContext] = useState<TenantContext>();
  const [client, setClient] = useState<CustomerTransport>();
  const selected = useRef(false);
  const directory = useQuery({
    queryKey: ['directory', runtimeConfig?.environment],
    queryFn: async () => {
      if (!runtimeConfig) throw new Error('Trusted mobile configuration is required');
      return parseDirectory(
        await fetchDirectory(runtimeConfig.directoryOrigin),
        runtimeConfig.environment,
      );
    },
    enabled: Boolean(runtimeConfig),
    retry: 1,
    staleTime: REFRESH_INTERVAL_MS,
    refetchInterval: REFRESH_INTERVAL_MS,
  });
  const clear = useCallback(() => {
    boundary.current?.clear();
    setContext(undefined);
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'directory' });
  }, [queryClient]);
  const select = useCallback(
    (id: string) => {
      if (!boundary.current || !runtimeConfig) return false;
      selected.current = true;
      let next: TenantContext;
      try {
        next = boundary.current.select(id);
      } catch {
        clear();
        return false;
      }
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'directory' });
      setContext(next);
      void readPreferences(runtimeConfig.environment)
        .then((preferences) =>
          savePreferences(next.environment, { ...preferences, lastTenantId: id }),
        )
        .catch(() => undefined);
      return true;
    },
    [queryClient, clear],
  );
  useEffect(() => {
    if (!directory.data) return;
    if (boundary.current) {
      try {
        boundary.current.updateDirectory(directory.data);
        setContext(boundary.current.capture());
      } catch {
        clear();
      }
    } else {
      boundary.current = new TenantBoundary(directory.data);
      setClient(new CustomerTransport(boundary.current, new CredentialVault(deviceSecrets)));
      if (runtimeConfig) {
        void readPreferences(runtimeConfig.environment)
          .then((preferences) => {
            if (!selected.current && preferences.lastTenantId) {
              try {
                select(preferences.lastTenantId);
              } catch {
                clear();
              }
            }
          })
          .catch(() => undefined);
      }
    }
    const remaining = Date.parse(directory.data.expiresAt) - Date.now();
    const timer = setTimeout(
      () => {
        setExpiredDirectory(directory.data);
        clear();
      },
      Math.max(0, remaining),
    );
    return () => clearTimeout(timer);
  }, [directory.data, clear, select]);
  const refetchDirectory = directory.refetch;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetchDirectory();
    });
    return () => subscription.remove();
  }, [refetchDirectory]);
  return (
    <RestaurantContext.Provider
      value={{
        directory: directory.data !== expiredDirectory ? directory.data : undefined,
        context,
        client,
        loading: directory.isFetching && !directory.data,
        select,
        clear,
        refresh: () => {
          void directory.refetch();
        },
      }}
    >
      {children}
    </RestaurantContext.Provider>
  );
}
export function useRestaurant(): RestaurantState {
  const state = useContext(RestaurantContext);
  if (!state) throw new Error('RestaurantProvider is required');
  return state;
}
