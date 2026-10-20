import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { readProduct, type ProductDetail, type OrderType } from '../../api/productDetail';
import { canBrowse } from '../../core/capabilities';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
import productQueryKey from './productQueryKey';
import { readSideDetails, sideProductIds } from './sideDetails';
export type FreshProductKey = readonly [principal: string, ownerVersion: string, request: string];
export default function useSideDetails(
  product: ProductDetail,
  channel?: OrderType,
  freshKey?: FreshProductKey,
) {
  const { context, client } = useRestaurant();
  const bootstrap = useBootstrap();
  const allowed = canBrowse(bootstrap.data);
  const { i18n } = useTranslation();
  const locale = i18n.language;
  const cache = useQueryClient();
  let ids: string[] = [];
  let unsupported = false;
  try {
    ids = sideProductIds(product);
  } catch {
    unsupported = true;
  }
  const publicKey = productQueryKey(context, product.id, locale, channel);
  const scopedKey = freshKey
    ? [...publicKey.slice(0, 2), freshKey[0], ...publicKey.slice(3), ...freshKey.slice(1)]
    : publicKey;
  const serializedKey = JSON.stringify([...scopedKey, 'side-details', ids]);
  const queryKey = useMemo<readonly unknown[]>(() => JSON.parse(serializedKey), [serializedKey]);
  const fresh = Boolean(freshKey);
  useEffect(() => {
    if (!fresh) return;
    return () => {
      void cache.cancelQueries({ queryKey, exact: true });
      cache.removeQueries({ queryKey, exact: true });
    };
  }, [cache, queryKey, fresh]);
  const query = useQuery({
    queryKey,
    enabled: Boolean(context && client && !unsupported && allowed),
    queryFn: () => {
      if (!context || !client || unsupported) throw new Error('Side details unavailable');
      const read = (id: string) => readProduct(client, context, id, locale, channel);
      if (freshKey) return readSideDetails(ids, read);
      return readSideDetails(ids, (id) =>
        cache.query({
          queryKey: productQueryKey(context, id, locale, channel),
          queryFn: () => read(id),
          staleTime: 30_000,
          retry: 1,
        }),
      );
    },
    retry: false,
    staleTime: freshKey ? 0 : 30_000,
    ...(freshKey ? { gcTime: 0 } : {}),
  });
  return {
    ...query,
    unsupported,
    data: query.isError || unsupported || !allowed ? undefined : query.data,
  };
}
