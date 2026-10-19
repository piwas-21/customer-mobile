import { useEffect, useMemo, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { useQueryClient } from '@tanstack/react-query';
import { BasketWorkspace } from '../../core/basketWorkspace';
import { deviceSessions } from '../../storage/sessions';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import { useSession } from '../account/SessionProvider';
export default function useBasketScope() {
  const { context, client } = useRestaurant();
  const { controller, userId, ownerVersion } = useSession();
  const cache = useQueryClient();
  const scope = useMemo(
    () => ({ context, client, controller, userId, ownerVersion }),
    [context, client, controller, userId, ownerVersion],
  );
  const key = useMemo(
    () =>
      [
        context?.environment,
        context?.tenant.id,
        userId ? `customer:${userId}` : 'guest:basket',
        'basket',
        context?.generation,
        ownerVersion,
      ] as const,
    [context, userId, ownerVersion],
  );
  const [resource, setResource] = useState<{ scope: typeof scope; workspace: BasketWorkspace }>();
  useEffect(() => {
    if (!scope.context || !scope.client || !scope.controller) return;
    let workspace: BasketWorkspace;
    try {
      workspace = new BasketWorkspace(
        scope.context,
        scope.client,
        deviceSessions,
        scope.controller,
        scope.userId ? { kind: 'customer', id: scope.userId } : { kind: 'guest', id: 'basket' },
        randomUUID,
      );
    } catch {
      return;
    }
    let active = true;
    // Restore the secure journal before exposing this effect-owned workspace.
    void workspace
      .hasPending()
      .catch(() => undefined)
      .then(() => {
        if (active) setResource({ scope, workspace });
      });
    return () => {
      active = false;
      workspace.dispose();
      void cache.cancelQueries({ queryKey: key });
      cache.removeQueries({ queryKey: key });
    };
  }, [scope, key, cache]);
  return { workspace: resource?.scope === scope ? resource.workspace : undefined, key };
}
