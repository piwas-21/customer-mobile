import { useEffect, useMemo, useState } from 'react';
import { openBrowserAsync } from 'expo-web-browser';
import { CustomerPaymentController } from '../../core/customerPaymentController';
import { deviceSessions } from '../../storage/sessions';
import { runtimeConfig } from '../../config';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
export default function usePaymentResource() {
  const { context } = useRestaurant();
  const session = useSession();
  const scope = useMemo(
    () => ({
      context,
      sessions: session.controller,
      userId: session.userId,
      revision: session.ownerVersion,
    }),
    [context, session.controller, session.userId, session.ownerVersion],
  );
  const key = useMemo(
    () =>
      [
        context?.environment,
        context?.tenant.id,
        scope.userId ? `customer:${scope.userId}` : 'guest:basket',
        'payment',
        context?.generation,
        scope.revision,
      ] as const,
    [context, scope.userId, scope.revision],
  );
  const [resource, setResource] = useState<{
    scope: typeof scope;
    controller: CustomerPaymentController;
  }>();
  useEffect(() => {
    if (!scope.context || !scope.sessions) return;
    let controller: CustomerPaymentController;
    try {
      controller = new CustomerPaymentController(
        scope.context,
        deviceSessions,
        scope.sessions,
        scope.userId ? { kind: 'customer', id: scope.userId } : { kind: 'guest', id: 'basket' },
        runtimeConfig?.hostedCheckoutOrigins ?? [],
        openBrowserAsync,
      );
    } catch {
      return;
    }
    let active = true;
    void controller
      .saved()
      .catch(() => undefined)
      .then(() => {
        if (active) setResource({ scope, controller });
      });
    return () => {
      active = false;
      controller.dispose();
    };
  }, [scope]);
  return { controller: resource?.scope === scope ? resource.controller : undefined, key };
}
