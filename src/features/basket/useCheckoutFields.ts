import { useQuery } from '@tanstack/react-query';
import { readCustomerForms } from '../../api/customerForms';
import type { OrderType } from '../../api/orderType';
import { checkoutFields } from '../../domain/checkoutFields';
import { useRestaurant } from '../restaurant/RestaurantProvider';
export default function useCheckoutFields(open: boolean, type: OrderType | null | undefined) {
  const { context, client } = useRestaurant();
  const query = useQuery({
    queryKey: [
      context?.environment,
      context?.tenant.id,
      'public',
      'checkout-fields',
      context?.generation,
    ],
    queryFn: () => readCustomerForms(client!, context!),
    enabled: Boolean(open && context && client),
    retry: false,
    staleTime: 0,
  });
  try {
    return { ...query, fields: query.isSuccess && type ? checkoutFields(query.data, type) : null };
  } catch {
    return { ...query, fields: null };
  }
}
