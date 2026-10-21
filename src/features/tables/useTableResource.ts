import { useCallback, useMemo } from 'react';
import { randomUUID } from 'expo-crypto';
import { TableVisitController } from '../../core/tableVisitController';
import usePrivateController from '../../core/usePrivateController';
import { deviceSessions } from '../../storage/sessions';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
import { canUse } from '../../core/capabilities';
export default function useTableResource() {
  const { context, client } = useRestaurant();
  const {
    controller: sessions,
    userId,
    ownerVersion,
    loading,
    failed,
    needsCleanup,
  } = useSession();
  const bootstrap = useBootstrap().data;
  const create = useCallback(() => {
    if (!context || !client || !sessions || !bootstrap) return undefined;
    return new TableVisitController(
      context,
      client,
      deviceSessions,
      sessions,
      userId ? { kind: 'customer', id: userId } : { kind: 'guest', id: 'basket' },
      randomUUID,
    );
  }, [context, client, sessions, userId, bootstrap]);
  const resource = usePrivateController(create, ownerVersion);
  const key = useMemo(
    () =>
      [
        context?.environment,
        context?.tenant.id,
        userId ? `customer:${userId}` : 'guest:basket',
        'table-visit',
        context?.generation,
        ownerVersion,
        resource.lifecycleRevision,
        resource.version,
      ] as const,
    [context, userId, ownerVersion, resource.lifecycleRevision, resource.version],
  );
  return {
    controller: resource.controller,
    key,
    loading,
    unavailable: failed || needsCleanup,
    allowPaymentReads: Boolean(
      resource.controller &&
      !sessions?.onlyRecoverOrders &&
      (!userId || canUse(bootstrap, 'accounts')),
    ),
  };
}
