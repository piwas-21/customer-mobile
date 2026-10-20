import { restoreOrderController } from '../../core/restoreOrderController';
import { useEffect, useMemo, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { CustomerCancellationController } from '../../core/customerCancellationController';
import { deviceSessions } from '../../storage/sessions';
import { canUse } from '../../core/capabilities';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
export default function useCancellationResource() {
  const { context, client } = useRestaurant();
  const session = useSession();
  const bootstrap = useBootstrap();
  const ordering = canUse(bootstrap.data, 'ordering');
  const scope = useMemo(
    () => ({
      context,
      client,
      sessions: session.controller,
      userId: session.userId,
      revision: session.ownerVersion,
      ordering,
    }),
    [context, client, session.controller, session.userId, session.ownerVersion, ordering],
  );
  const key = useMemo(
    () =>
      [
        context?.environment,
        context?.tenant.id,
        scope.userId ? `customer:${scope.userId}` : 'guest:basket',
        'cancellation',
        context?.generation,
        scope.revision,
      ] as const,
    [context, scope.userId, scope.revision],
  );
  const [resource, setResource] = useState<{
    scope: typeof scope;
    controller: CustomerCancellationController;
  }>();
  useEffect(() => {
    if (!scope.context || !scope.client || !scope.sessions) return;
    let controller: CustomerCancellationController;
    try {
      controller = new CustomerCancellationController(
        scope.context,
        scope.client,
        deviceSessions,
        scope.sessions,
        scope.userId ? { kind: 'customer', id: scope.userId } : { kind: 'guest', id: 'basket' },
        randomUUID,
        scope.ordering,
      );
    } catch {
      return;
    }
    return restoreOrderController(controller, () => setResource({ scope, controller }));
  }, [scope]);
  return { controller: resource?.scope === scope ? resource.controller : undefined, key };
}
