import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { readProduct, type ProductDetail, type OrderType } from '../../api/productDetail';
import { canBrowse } from '../../core/capabilities';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
import productQueryKey from './productQueryKey';
import { readSideDetails, sideProductIds } from './sideDetails';
export default function useSideDetails(product: ProductDetail, channel?: OrderType) {
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
  const query = useQuery({
    queryKey: [...productQueryKey(context, product.id, locale, channel), 'side-details', ids],
    enabled: Boolean(context && client && !unsupported && allowed),
    queryFn: () => {
      if (!context || !client || unsupported) throw new Error('Side details unavailable');
      return readSideDetails(ids, (id) =>
        cache.query({
          queryKey: productQueryKey(context, id, locale, channel),
          queryFn: () => readProduct(client, context, id, locale, channel),
          staleTime: 30_000,
          retry: 1,
        }),
      );
    },
    retry: false,
    staleTime: 30_000,
  });
  return {
    ...query,
    unsupported,
    data: query.isError || unsupported || !allowed ? undefined : query.data,
  };
}
