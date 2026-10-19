import { useQuery } from '@tanstack/react-query';
import { readOrderTypes } from '../../api/basketChannel';
import { canUse } from '../../core/capabilities';
import { ApiFailure } from '../../core/transport';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
export default function useOrderTypes(open: boolean) {
  const { context, client } = useRestaurant();
  const bootstrap = useBootstrap();
  const enabled = open && canUse(bootstrap.data, 'ordering');
  const query = useQuery({
    queryKey: [
      context?.environment,
      context?.tenant.id,
      'public',
      'order-types',
      context?.generation,
    ],
    queryFn: () => {
      if (!context || !client) throw new ApiFailure(0, 'refused');
      return readOrderTypes(client, context);
    },
    enabled: Boolean(enabled && context && client),
    retry: false,
    staleTime: 0,
  });
  return {
    ...query,
    isPending: enabled && query.isPending,
    data: enabled && query.isSuccess ? query.data : undefined,
  };
}
