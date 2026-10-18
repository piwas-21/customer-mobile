import { useQuery } from '@tanstack/react-query';
import { readBootstrap } from '../../api/bootstrap';
import { useRestaurant } from './RestaurantProvider';
export default function useBootstrap() {
  const { client, context } = useRestaurant();
  const query = useQuery({
    queryKey: [
      context?.environment,
      context?.tenant.id,
      'public',
      'bootstrap',
      1,
      context?.generation,
    ],
    queryFn: () => {
      if (!client || !context) throw new Error('Select a restaurant');
      return readBootstrap(client, context);
    },
    enabled: Boolean(client && context),
    retry: 1,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  return { ...query, data: query.isError ? undefined : query.data };
}
