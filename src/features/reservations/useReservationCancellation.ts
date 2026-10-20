import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReservationCancellationReview } from '../../core/reservationCancellationActions';
import { useReservation } from './ReservationProvider';
export default function useReservationCancellation(reservationId: string) {
  const operations = useReservation();
  const controller = operations?.controller;
  const { i18n } = useTranslation();
  const scope = useMemo(() => ({ controller, reservationId }), [controller, reservationId]);
  const active = useRef<typeof scope | undefined>(undefined);
  const reviewed = useRef<ReservationCancellationReview | undefined>(undefined);
  const [review, setReview] = useState<{
    scope: typeof scope;
    value: ReservationCancellationReview;
  }>();
  const [preparing, setPreparing] = useState<typeof scope>();
  const [failed, setFailed] = useState<typeof scope>();
  useLayoutEffect(() => {
    active.current = scope;
    return () => {
      active.current = undefined;
      const value = reviewed.current;
      reviewed.current = undefined;
      if (value) {
        try {
          controller?.dismissCancellation(value.operationId);
        } catch {
          /* Owner withdrawn. */
        }
      }
    };
  }, [scope, controller]);
  const current = () => active.current === scope && Boolean(controller);
  const value = review?.scope === scope ? review.value : undefined;
  async function prepare() {
    if (!controller || !current() || preparing === scope || operations?.busy || operations?.value)
      return;
    setPreparing(scope);
    setFailed(undefined);
    try {
      const next = await controller.prepareCancellation(reservationId, i18n.language);
      if (!current()) {
        try {
          controller.dismissCancellation(next.operationId);
        } catch {
          /* Owner withdrawn. */
        }
        return;
      }
      controller.assertCurrent();
      reviewed.current = next;
      setReview({ scope, value: next });
    } catch {
      if (current()) setFailed(scope);
    } finally {
      if (current()) setPreparing(undefined);
    }
  }
  function dismiss() {
    if (!value || !current() || reviewed.current !== value) return;
    try {
      controller?.dismissCancellation(value.operationId);
    } catch {
      /* Owner withdrawn. */
    }
    reviewed.current = undefined;
    setReview(undefined);
  }
  async function confirm() {
    if (!value || !current() || reviewed.current !== value || !operations || operations.busy)
      return;
    reviewed.current = undefined;
    setReview(undefined);
    try {
      await operations.confirmCancellation(value.operationId);
      if (current()) {
        controller?.assertCurrent();
      }
    } catch {
      // The durable original attempt is displayed by the shared provider, including ambiguity.
      if (current()) setFailed(scope);
    }
  }
  return {
    available: Boolean(controller),
    review: value,
    busy: preparing === scope || Boolean(operations?.busy || operations?.loading),
    blocked: operations?.value !== null,
    failed: failed === scope,
    prepare,
    dismiss,
    confirm,
  };
}
