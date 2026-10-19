import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { canBrowse } from '../../core/capabilities';
import useBootstrap from '../restaurant/useBootstrap';
import { readProducts } from '../../api/catalogue';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import usePublicMenuSnapshot from './usePublicMenuSnapshot';
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
    queryFn: async ({ pageParam }) => {
      if (!context || !client) throw new Error('Restaurant context is required');
      return {
        ...(await readProducts(client, context, pageParam, i18n.language)),
        fetchedAt: Date.now(),
      };
    },
    enabled: Boolean(context && client && canBrowse(bootstrap.data)),
    initialPageParam: 1,
    staleTime: 30_000,
    getNextPageParam: (page) => (page.page < page.totalPages ? page.page + 1 : undefined),
    retry: 1,
  });
  usePublicMenuSnapshot(
    context,
    bootstrap.data,
    i18n.language,
    menu.data?.pages,
    !menu.isFetching && !menu.isError,
  );
  return { menu, bootstrap };
}
