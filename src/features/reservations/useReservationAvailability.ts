import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  readReservationAvailability,
  type AvailabilityInput,
  type ReservationAvailability,
} from '../../api/reservationAvailability';
import type { TenantContext } from '../../core/tenantContext';
import type { CustomerTransport } from '../../core/transport';
export default function useReservationAvailability(
  client: CustomerTransport,
  context: TenantContext,
  zone: string,
  input: AvailabilityInput,
) {
  const [lifecycle, setLifecycle] = useState(0);
  const scope = useMemo(
    () => ({ client, context, zone, date: input.date, party: input.numberOfGuests, lifecycle }),
    [client, context, zone, input.date, input.numberOfGuests, lifecycle],
  );
  type Result = {
    scope: typeof scope;
    kind: 'pending' | 'ready' | 'failed';
    data?: ReservationAvailability;
  };
  const [result, setResult] = useState<Result>();
  const revision = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      revision.current += 1;
    };
  }, []);
  useEffect(() => {
    const listener = AppState.addEventListener('change', () => {
      revision.current += 1;
      setLifecycle((value) => value + 1);
      setResult(undefined);
    });
    return () => listener.remove();
  }, []);
  const read = useCallback(async () => {
    const request = ++revision.current;
    setResult({ scope, kind: 'pending' });
    try {
      const data = await readReservationAvailability(
        client,
        context,
        { date: scope.date, numberOfGuests: scope.party },
        zone,
      );
      if (mounted.current && revision.current === request)
        setResult({ scope, kind: 'ready', data });
    } catch {
      if (mounted.current && revision.current === request) setResult({ scope, kind: 'failed' });
    }
  }, [client, context, zone, scope]);
  const current = result?.scope === scope ? result : undefined;
  return {
    data: current?.kind === 'ready' ? current.data : undefined,
    loading: current?.kind === 'pending',
    failed: current?.kind === 'failed',
    read: () => {
      void read();
    },
  };
}
