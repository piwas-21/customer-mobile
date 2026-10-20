import { useMemo, useRef, useState } from 'react';
import type { CheckoutQuote } from '../../api/checkoutQuoteResponse';
import useMounted from '../../core/useMounted';
import type { useBasket } from './BasketProvider';
const defaultSelection: Readonly<{ pointsToRedeem: number; tip: number }> = Object.freeze({
  pointsToRedeem: 0,
  tip: 0,
});
export default function useCheckoutReview(basket: ReturnType<typeof useBasket>) {
  const mounted = useMounted();
  const generation = useRef(0);
  const active = useRef(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [quote, setQuote] = useState<CheckoutQuote>();
  const revision = JSON.stringify([
    basket.basket?.id,
    basket.basket?.purchaseFingerprint,
    basket.basket?.orderType,
    basket.revision,
    basket.canRedeemPoints,
  ]);
  const scope = useMemo(() => ({ revision }), [revision]);
  const [reviewed, setReviewed] = useState<typeof scope>();
  const allowed = Boolean(
    basket.canAdd &&
    !basket.failed &&
    basket.basket?.items.length &&
    (basket.basket.orderType === 'Takeaway' || basket.basket.orderType === 'Delivery'),
  );
  const changed = open && (reviewed !== scope || !allowed);
  async function show(selection = defaultSelection) {
    if (!allowed || active.current) return;
    active.current = true;
    const request = ++generation.current;
    setReviewed(scope);
    setQuote(undefined);
    setFailed(false);
    setBusy(true);
    setOpen(true);
    try {
      const result = await basket.quote(selection);
      if (mounted.current && generation.current === request) setQuote(result);
    } catch {
      if (mounted.current && generation.current === request) setFailed(true);
    } finally {
      if (generation.current === request) {
        active.current = false;
        if (mounted.current) setBusy(false);
      }
    }
  }
  return {
    open,
    busy,
    failed,
    changed,
    allowed,
    quote: changed ? undefined : quote,
    show,
    close: () => {
      generation.current++;
      active.current = false;
      setOpen(false);
      setBusy(false);
      setQuote(undefined);
    },
  };
}
