import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { readProduct, type OrderType } from '../../api/productDetail';
import { canBrowse } from '../../core/capabilities';
import useBootstrap from '../restaurant/useBootstrap';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import productQueryKey from './productQueryKey';

export default function useProduct(id: string, orderType?: OrderType) {
  const { context, client } = useRestaurant();
  const { i18n } = useTranslation();
  const locale = i18n.language;
  const bootstrap = useBootstrap();
  const validId = z.uuid().safeParse(id).success;
  const allowed = canBrowse(bootstrap.data);
  const query = useQuery({
    queryKey: productQueryKey(context, id, locale, orderType),
    queryFn: () => {
      if (!client || !context || !validId) throw new Error('Invalid product');
      return readProduct(client, context, id, locale, orderType);
    },
    enabled: Boolean(context && client && validId && allowed),
    retry: 1,
  });
  return {
    product: allowed && !query.isError ? query.data : undefined,
    loading: (bootstrap.isPending || query.isFetching) && validId,
    unavailable: query.isError || bootstrap.isError || !allowed || !validId,
  };
}
