import { useCallback, useMemo } from 'react';
import { randomUUID } from 'expo-crypto';
import { TableRoundController } from '../../core/tableRoundController';
import usePrivateController from '../../core/usePrivateController';
import { deviceSessions } from '../../storage/sessions';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
export default function useRoundResource() {
  const { context, client } = useRestaurant();
  const session = useSession();
  const bootstrap = useBootstrap().data;
  const create = useCallback(() => {
    if (!context || !client || !session.controller || !bootstrap) return undefined;
    return new TableRoundController(
      context,
      client,
      deviceSessions,
      session.controller,
      session.userId ? { kind: 'customer', id: session.userId } : { kind: 'guest', id: 'basket' },
      bootstrap,
      randomUUID,
    );
  }, [context, client, session.controller, session.userId, bootstrap]);
  const resource = usePrivateController(create, session.ownerVersion);
  const scope = useMemo(
    () =>
      [
        context?.environment,
        context?.tenant.id,
        session.userId ? `customer:${session.userId}` : 'guest:basket',
      ] as const,
    [context, session.userId],
  );
  return { controller: resource.controller, scope };
}
