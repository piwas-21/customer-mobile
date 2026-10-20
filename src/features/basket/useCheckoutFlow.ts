import { useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import type { CheckoutIntent } from '../../api/checkoutIntent';
import {
  emptyCheckoutDraft,
  inspectCheckoutDraft,
  type CheckoutDraft,
} from '../../domain/checkoutDraft';
import type { useBasket } from './BasketProvider';
import useCheckoutFields from './useCheckoutFields';
import useCheckoutReview from './useCheckoutReview';
import useMounted from '../../core/useMounted';
import type { CustomerAddress } from '../../api/customerAddresses';
import { applyCheckoutAddress } from '../../domain/checkoutSavedAddress';
export default function useCheckoutFlow(basket: ReturnType<typeof useBasket>) {
  const review = useCheckoutReview(basket);
  const mounted = useMounted();
  const sending = useRef(false);
  const [placing, setPlacing] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(emptyCheckoutDraft);
  const [submitted, setSubmitted] = useState(false);
  const [reviewed, setReviewed] = useState<CheckoutDraft>();
  const [method, setMethod] = useState<CheckoutIntent['paymentMethod']>('Cash');
  const fields = useCheckoutFields(open, basket.basket?.orderType);
  const inspection = fields.fields ? inspectCheckoutDraft(draft, fields.fields) : null;
  const clear = () => {
    setOpen(false);
    review.close();
    setDraft(emptyCheckoutDraft());
    setReviewed(undefined);
  };
  async function showReview() {
    setSubmitted(true);
    if (
      !inspection?.values ||
      sending.current ||
      (inspection.values.pointsToRedeem > 0 && !basket.canRedeemPoints)
    )
      return;
    Keyboard.dismiss();
    setReviewed({ ...draft });
    setMethod('Cash');
    await review.show({
      pointsToRedeem: inspection.values.pointsToRedeem,
      tip: inspection.values.tip,
    });
  }
  async function place() {
    const quote = review.quote;
    const values =
      reviewed && fields.fields ? inspectCheckoutDraft(reviewed, fields.fields).values : null;
    if (
      !quote ||
      !values ||
      !basket.canAdd ||
      (values.pointsToRedeem > 0 && !basket.canRedeemPoints) ||
      sending.current ||
      !quote.availablePaymentMethods.includes(method)
    )
      return;
    sending.current = true;
    setPlacing(true);
    try {
      await basket.placeOrder({
        review: {
          schemaVersion: 1,
          expectedBasketId: quote.basketId,
          expectedPurchaseFingerprint: quote.purchaseFingerprint,
          type: quote.type,
          pointsToRedeem: values.pointsToRedeem,
          tip: values.tip,
        },
        expectedQuoteFingerprint: quote.quoteFingerprint,
        contact: values.contact,
        paymentMethod: method,
        ...(values.address ? { address: values.address } : {}),
      });
    } catch {
      // The owner provider restores the durable outcome; the form never retries the order.
    } finally {
      sending.current = false;
      if (mounted.current) {
        setPlacing(false);
        clear();
      }
    }
  }
  const reviewedValues =
    reviewed && fields.fields ? inspectCheckoutDraft(reviewed, fields.fields).values : null;
  return {
    canRedeemPoints: basket.canRedeemPoints,
    reviewedPoints: reviewedValues?.pointsToRedeem ?? 0,
    canPlace: Boolean(
      review.quote &&
      !review.changed &&
      reviewed &&
      fields.fields &&
      reviewedValues &&
      (reviewedValues.pointsToRedeem === 0 || basket.canRedeemPoints) &&
      basket.canAdd,
    ),
    open,
    draft,
    review,
    method,
    fields,
    busy: basket.busy || placing,
    allowed: review.allowed,
    invalid: (key: keyof CheckoutDraft) => submitted && inspection?.errors.has(key),
    change: (key: keyof CheckoutDraft, value: string) => {
      if (!sending.current) setDraft((previous) => ({ ...previous, [key]: value }));
    },
    applyAddress: (address: CustomerAddress) => {
      if (!sending.current && !basket.busy && fields.fields?.address.length) {
        review.close();
        setReviewed(undefined);
        setSubmitted(true);
        setDraft((previous) => applyCheckoutAddress(previous, address));
      }
    },
    show: () => {
      if (review.allowed) {
        setSubmitted(false);
        setDraft(emptyCheckoutDraft());
        setOpen(true);
      }
    },
    close: () => {
      if (!basket.busy && !sending.current) clear();
    },
    back: () => {
      if (!sending.current) review.close();
    },
    chooseMethod: setMethod,
    showReview,
    place,
  };
}
