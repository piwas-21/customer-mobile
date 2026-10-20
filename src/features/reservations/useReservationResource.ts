import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { CustomerReservationController } from '../../core/customerReservationController';
import { restoreOrderController } from '../../core/restoreOrderController';
import { deviceSessions } from '../../storage/sessions';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
let nextReservationResource = 0;
export default function useReservationResource() {
  const { context, client } = useRestaurant();
  const session = useSession();
  const bootstrap = useBootstrap().data;
  const activeController = useRef<CustomerReservationController | undefined>(undefined);
  const [lifecycle, setLifecycle] = useState({
    active: AppState.currentState === 'active',
    revision: 0,
  });
  useLayoutEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      activeController.current?.dispose();
      setLifecycle((previous) => ({ active: state === 'active', revision: previous.revision + 1 }));
    });
    return () => listener.remove();
  }, []);
  const scope = useMemo(
    () => ({
      context,
      client,
      sessions: session.controller,
      userId: session.userId,
      ownerVersion: session.ownerVersion,
      bootstrap,
      lifecycle,
    }),
    [
      context,
      client,
      session.controller,
      session.userId,
      session.ownerVersion,
      bootstrap,
      lifecycle,
    ],
  );
  const [resource, setResource] = useState<{
    scope: typeof scope;
    controller: CustomerReservationController;
    version: number;
  }>();
  useLayoutEffect(() => {
    if (
      !scope.context ||
      !scope.client ||
      !scope.sessions ||
      !scope.bootstrap ||
      !scope.lifecycle.active
    )
      return;
    let controller: CustomerReservationController;
    try {
      controller = new CustomerReservationController(
        scope.context,
        scope.client,
        deviceSessions,
        scope.sessions,
        scope.userId ? { kind: 'customer', id: scope.userId } : { kind: 'guest', id: 'bookings' },
        randomUUID,
        scope.bootstrap,
      );
    } catch {
      return;
    }
    const version = ++nextReservationResource;
    activeController.current = controller;
    const withdraw = restoreOrderController(controller, () =>
      setResource({ scope, controller, version }),
    );
    return () => {
      if (activeController.current === controller) activeController.current = undefined;
      withdraw();
    };
  }, [scope]);
  const current = resource?.scope === scope ? resource : undefined;
  const key = useMemo(
    () =>
      [
        context?.environment,
        context?.tenant.id,
        scope.userId ? `customer:${scope.userId}` : 'guest:bookings',
        'reservation-attempt',
        context?.generation,
        scope.ownerVersion,
        scope.lifecycle.revision,
        current?.version,
      ] as const,
    [context, scope.userId, scope.ownerVersion, scope.lifecycle.revision, current?.version],
  );
  return { controller: current?.controller, key };
}
