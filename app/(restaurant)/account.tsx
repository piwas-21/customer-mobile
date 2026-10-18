import AccountScreen from '../../src/features/account/AccountScreen';
import { useRestaurant } from '../../src/features/restaurant/RestaurantProvider';
import { useSession } from '../../src/features/account/SessionProvider';
export default function AccountRoute() {
  const { context } = useRestaurant();
  const session = useSession();
  return (
    <AccountScreen key={`${context?.tenant.id}.${context?.generation}.${session.unavailable}`} />
  );
}
