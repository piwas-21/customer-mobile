import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReservationEditContext } from '../../api/reservationEditReads';
import { useReservation } from './ReservationProvider';
export default function useReservationEditContext(reservationId: string) {
  const operations = useReservation();
  const controller = operations?.controller;
  const [revision, setRevision] = useState(0);
  const scope = useMemo(
    () => ({ controller, reservationId, revision }),
    [controller, reservationId, revision],
  );
  const active = useRef<typeof scope | undefined>(undefined);
  const [result, setResult] = useState<{
    scope: typeof scope;
    data?: ReservationEditContext;
    failed?: true;
  }>();
  useLayoutEffect(() => {
    active.current = scope;
    return () => {
      active.current = undefined;
    };
  }, [scope]);
  useEffect(() => {
    if (!controller) return;
    void controller.editContext(reservationId).then(
      (data) => {
        if (active.current === scope) setResult({ scope, data });
      },
      () => {
        if (active.current === scope) setResult({ scope, failed: true });
      },
    );
  }, [controller, reservationId, scope]);
  const current = result?.scope === scope ? result : undefined;
  return {
    controller,
    operations,
    data: current?.data,
    version: revision,
    failed: current?.failed === true,
    loading: Boolean(controller && !current),
    refresh: () => setRevision((value) => value + 1),
  };
}
