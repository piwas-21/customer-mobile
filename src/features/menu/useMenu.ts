import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { canBrowse } from '../../core/capabilities';
import useBootstrap from '../restaurant/useBootstrap';
import { readProducts } from '../../api/catalogue';
import { useRestaurant } from '../restaurant/RestaurantProvider';
export default function useMenu() {
  const { context, client } = useRestaurant();
  const { i18n } = useTranslation();
  const bootstrap = useBootstrap();
  const menu = useInfiniteQuery({
    queryKey: [
      context?.environment,
      context?.tenant.id,
      'public',
      'catalogue',
      i18n.language,
      context?.generation,
    ],
    queryFn: ({ pageParam }) => {
      if (!context || !client) throw new Error('Restaurant context is required');
      return readProducts(client, context, pageParam, i18n.language);
    },
    enabled: Boolean(context && client && canBrowse(bootstrap.data)),
    initialPageParam: 1,
    staleTime: 30_000,
    getNextPageParam: (page) => (page.page < page.totalPages ? page.page + 1 : undefined),
    retry: 1,
  });
  return { menu, bootstrap };
}
