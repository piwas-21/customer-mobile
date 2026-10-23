import { useCallback, useMemo } from 'react';
import usePrivateController from '../../core/usePrivateController';
import type { TenantContext } from '../../core/tenantContext';
import type { CustomerTransport } from '../../core/transport';
import type { SessionController } from '../../core/sessionController';
import type { Principal } from '../../core/credentials';
import type { Bootstrap } from '../../core/capabilities';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
export type TableOperationSource = {
  context: TenantContext;
  client: CustomerTransport;
  sessions: SessionController;
  principal: Principal;
  bootstrap: Bootstrap;
};
export default function useTableOperationResource<
  Actor extends { saved: () => Promise<unknown>; dispose: () => void },
>(kind: string, factory: (source: TableOperationSource) => Actor) {
  const { context, client } = useRestaurant();
  const session = useSession();
  const bootstrap = useBootstrap().data;
  const create = useCallback(() => {
    if (!context || !client || !session.controller || !bootstrap) return undefined;
    return factory({
      context,
      client,
      sessions: session.controller,
      principal: session.userId
        ? { kind: 'customer', id: session.userId }
        : { kind: 'guest', id: 'basket' },
      bootstrap,
    });
  }, [context, client, session.controller, session.userId, bootstrap, factory]);
  const resource = usePrivateController(create, session.ownerVersion);
  const key = useMemo(
    () =>
      [
        context?.environment,
        context?.tenant.id,
        session.userId ? `customer:${session.userId}` : 'guest:basket',
        kind,
        context?.generation,
        session.ownerVersion,
        resource.version,
      ] as const,
    [context, session.userId, kind, session.ownerVersion, resource.version],
  );
  return { controller: resource.controller, key };
}
