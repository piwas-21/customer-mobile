import { useQuery } from '@tanstack/react-query';
import { readCustomerForms } from '../../api/customerForms';
import { reservationContactFields } from '../../domain/reservationContact';
import { useRestaurant } from '../restaurant/RestaurantProvider';
export default function useReservationFields() {
  const { context, client } = useRestaurant();
  const query = useQuery({
    queryKey: [
      context?.environment,
      context?.tenant.id,
      'public',
      'reservation-fields',
      context?.generation,
    ],
    queryFn: () => readCustomerForms(client!, context!),
    enabled: Boolean(client && context),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  try {
    return { ...query, fields: query.isSuccess ? reservationContactFields(query.data) : null };
  } catch {
    return { ...query, fields: null };
  }
}
