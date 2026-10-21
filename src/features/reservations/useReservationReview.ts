import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CustomerReservationController } from '../../core/customerReservationController';
import { useReservation, type ReservationState } from './ReservationProvider';
type ReviewActions<Input, Review> = Readonly<{
  prepare: (
    controller: CustomerReservationController,
    input: Input,
    locale: string,
  ) => Promise<Review>;
  dismiss: (controller: CustomerReservationController, operationId: string) => void;
  confirm: (operations: ReservationState, operationId: string) => Promise<unknown>;
}>;
export default function useReservationReview<Input, Review extends { operationId: string }>(
  input: Input,
  actions: ReviewActions<Input, Review>,
) {
  const operations = useReservation();
  const controller = operations?.controller;
  const { i18n } = useTranslation();
  const scope = useMemo(() => ({ controller, input }), [controller, input]);
  const active = useRef<typeof scope | undefined>(undefined);
  const reviewed = useRef<Review | undefined>(undefined);
  const [review, setReview] = useState<{
    scope: typeof scope;
    value: Review;
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
          if (controller) actions.dismiss(controller, value.operationId);
        } catch {
          /* Owner withdrawn. */
        }
      }
    };
  }, [scope, controller, actions]);
  const current = () => active.current === scope && Boolean(controller);
  const value = review?.scope === scope ? review.value : undefined;
  async function prepare() {
    if (!controller || !current() || preparing === scope || operations?.busy || operations?.value)
      return;
    setPreparing(scope);
    setFailed(undefined);
    try {
      const next = await actions.prepare(controller, input, i18n.language);
      if (!current()) {
        try {
          actions.dismiss(controller, next.operationId);
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
      if (controller) actions.dismiss(controller, value.operationId);
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
      await actions.confirm(operations, value.operationId);
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
