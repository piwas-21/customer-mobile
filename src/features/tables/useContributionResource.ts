import { useCallback, useMemo } from 'react';
import { randomUUID } from 'expo-crypto';
import { openBrowserAsync } from 'expo-web-browser';
import { TableContributionController } from '../../core/tableContributionController';
import usePrivateController from '../../core/usePrivateController';
import { deviceSessions } from '../../storage/sessions';
import { runtimeConfig } from '../../config';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
export default function useContributionResource() {
  const { context, client } = useRestaurant();
  const session = useSession();
  const bootstrap = useBootstrap().data;
  const create = useCallback(() => {
    if (!context || !client || !session.controller || !bootstrap) return undefined;
    return new TableContributionController(
      context,
      client,
      deviceSessions,
      session.controller,
      session.userId ? { kind: 'customer', id: session.userId } : { kind: 'guest', id: 'basket' },
      bootstrap,
      randomUUID,
      runtimeConfig?.hostedCheckoutOrigins ?? [],
      openBrowserAsync,
    );
  }, [context, client, session.controller, session.userId, bootstrap]);
  const resource = usePrivateController(create, session.ownerVersion);
  const key = useMemo(
    () =>
      [
        context?.environment,
        context?.tenant.id,
        session.userId ? `customer:${session.userId}` : 'guest:basket',
        'table-contribution',
        context?.generation,
        session.ownerVersion,
        resource.version,
      ] as const,
    [context, session.userId, session.ownerVersion, resource.version],
  );
  return { controller: resource.controller, key };
}
