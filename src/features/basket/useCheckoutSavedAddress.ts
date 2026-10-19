import { useMemo, useState } from 'react';
import type { CustomerAddress } from '../../api/customerAddresses';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
export default function useCheckoutSavedAddress(
  enabled: boolean,
  apply: (address: CustomerAddress) => void,
) {
  const { context } = useRestaurant();
  const { controller, userId, ownerVersion, unavailable, needsCleanup } = useSession();
  const scope = useMemo(
    () => ({ enabled, context, controller, userId, ownerVersion, unavailable, needsCleanup }),
    [enabled, context, controller, userId, ownerVersion, unavailable, needsCleanup],
  );
  const [selection, setSelection] = useState<{
    scope: typeof scope;
    context: NonNullable<typeof context>;
    controller: NonNullable<typeof controller>;
    userId: string;
    ownerVersion: string;
    guard: () => void;
  }>();
  const available = Boolean(
    enabled && context && controller && userId && !unavailable && !needsCleanup,
  );
  const current = available && selection?.scope === scope ? selection : undefined;
  return {
    available,
    current,
    show: () => {
      if (!available || !context || !controller || !userId) return;
      try {
        const guard = controller.captureRequestOwner({ kind: 'customer', id: userId });
        setSelection({ scope, context, controller, userId, ownerVersion, guard });
      } catch {
        setSelection(undefined);
      }
    },
    close: () => setSelection(undefined),
    select: (address: CustomerAddress) => {
      if (!current) return;
      try {
        current.guard();
        apply(address);
      } catch {
        // A withdrawn session cannot supply another customer's checkout details.
      } finally {
        setSelection(undefined);
      }
    },
  };
}
