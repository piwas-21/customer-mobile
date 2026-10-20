import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { readProduct, type OrderType } from '../../api/productDetail';
import type { ReorderCandidate } from '../../domain/reorder';
import { canUse } from '../../core/capabilities';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
export default function useReorderProduct(
  candidate: ReorderCandidate,
  freshKey: string,
  channel: OrderType | undefined,
) {
  const { context, client } = useRestaurant();
  const { controller, userId, ownerVersion } = useSession();
  const [owner] = useState(() => ({ context, controller, userId, ownerVersion }));
  const owned =
    owner.context === context &&
    owner.controller === controller &&
    owner.userId === userId &&
    owner.ownerVersion === ownerVersion;
  const bootstrap = useBootstrap();
  const { i18n } = useTranslation();
  const locale = i18n.language;
  const cache = useQueryClient();
  const [attempt, setAttempt] = useState(0);
  const allowed =
    owned && canUse(bootstrap.data, 'ordering') && controller?.onlyRecoverOrders === false;
  const key = useMemo(
    () =>
      [
        context?.environment,
        context?.tenant.id,
        userId ? `customer:${userId}` : 'guest:basket',
        'reorder-product',
        freshKey,
        candidate.key,
        candidate.productId,
        context?.generation,
        ownerVersion,
        channel,
        locale,
        attempt,
      ] as const,
    [context, userId, ownerVersion, freshKey, candidate, channel, locale, attempt],
  );
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(
      allowed && context && client && controller && candidate.productId && candidate.seed,
    ),
    queryFn: async () => {
      if (!allowed || !context || !client || !controller || !candidate.productId || !candidate.seed)
        throw new Error('Reorder unavailable');
      const guard = controller.captureRequestOwner(
        userId ? { kind: 'customer', id: userId } : { kind: 'guest', id: 'basket' },
      );
      const product = await readProduct(client, context, candidate.productId, locale, channel);
      guard();
      return product;
    },
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  useEffect(
    () => () => {
      void cache.cancelQueries({ queryKey: key, exact: true });
      cache.removeQueries({ queryKey: key, exact: true });
    },
    [cache, key],
  );
  return {
    allowed,
    product: allowed && !query.isError && !query.isFetching ? query.data : undefined,
    loading: (query.isPending || query.isFetching) && allowed,
    failed: query.isError || !allowed,
    freshKey: [
      userId ? `customer:${userId}` : 'guest:basket',
      ownerVersion,
      `${freshKey}:${attempt}`,
    ] as const,
    refresh: () => setAttempt((value) => value + 1),
  };
}
