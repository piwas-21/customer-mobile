import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CustomerReservationController } from '../../core/customerReservationController';
import type { AvailabilityInput } from '../../api/reservationAvailability';
export default function useOwnedReservationTimes(
  controller: CustomerReservationController,
  reservationId: string,
  input: AvailabilityInput,
) {
  const scope = useMemo(
    () => ({ controller, reservationId, date: input.date, numberOfGuests: input.numberOfGuests }),
    [controller, reservationId, input.date, input.numberOfGuests],
  );
  const active = useRef<typeof scope | undefined>(undefined);
  const pending = useRef<typeof scope | undefined>(undefined);
  const [result, setResult] = useState<{
    scope: typeof scope;
    data?: Awaited<ReturnType<CustomerReservationController['editAvailability']>>;
    failed?: true;
  }>();
  const [loading, setLoading] = useState<typeof scope>();
  useLayoutEffect(() => {
    active.current = scope;
    return () => {
      active.current = undefined;
    };
  }, [scope]);
  async function read() {
    if (active.current !== scope || pending.current === scope) return;
    pending.current = scope;
    setLoading(scope);
    setResult(undefined);
    try {
      const data = await controller.editAvailability(reservationId, {
        date: scope.date,
        numberOfGuests: scope.numberOfGuests,
      });
      if (active.current === scope) setResult({ scope, data });
    } catch {
      if (active.current === scope) setResult({ scope, failed: true });
    } finally {
      if (pending.current === scope) pending.current = undefined;
      if (active.current === scope) setLoading(undefined);
    }
  }
  return {
    data: result?.scope === scope ? result.data : undefined,
    failed: result?.scope === scope && result.failed === true,
    loading: loading === scope,
    read,
  };
}
