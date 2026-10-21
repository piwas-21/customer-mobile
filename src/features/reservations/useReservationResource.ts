import { useCallback, useMemo } from 'react';
import { randomUUID } from 'expo-crypto';
import { CustomerReservationController } from '../../core/customerReservationController';
import usePrivateController from '../../core/usePrivateController';
import { deviceSessions } from '../../storage/sessions';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
export default function useReservationResource() {
  const { context, client } = useRestaurant();
  const { controller: sessions, userId, ownerVersion } = useSession();
  const bootstrap = useBootstrap().data;
  const create = useCallback(() => {
    if (!context || !client || !sessions || !bootstrap) return undefined;
    return new CustomerReservationController(
      context,
      client,
      deviceSessions,
      sessions,
      userId ? { kind: 'customer', id: userId } : { kind: 'guest', id: 'bookings' },
      randomUUID,
      bootstrap,
    );
  }, [context, client, sessions, userId, bootstrap]);
  const resource = usePrivateController(create, ownerVersion);
  const key = useMemo(
    () =>
      [
        context?.environment,
        context?.tenant.id,
        userId ? `customer:${userId}` : 'guest:bookings',
        'reservation-attempt',
        context?.generation,
        ownerVersion,
        resource.lifecycleRevision,
        resource.version,
      ] as const,
    [context, userId, ownerVersion, resource.lifecycleRevision, resource.version],
  );
  return { controller: resource.controller, key };
}
