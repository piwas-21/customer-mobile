import { useRef, useState } from 'react';
import type { BasketChannelPreview } from '../../api/basketChannelPreview';
import type { OrderType } from '../../api/orderType';
import { emptyUuid } from '../../core/identifiers';
import useMounted from '../../core/useMounted';
import type { useBasket } from './BasketProvider';
export default function useBasketChannelChoice(basket: ReturnType<typeof useBasket>) {
  const mounted = useMounted();
  const active = useRef(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState<BasketChannelPreview>();
  const locked = busy || basket.busy;
  const changed = Boolean(
    preview &&
    (preview.basketId !== (basket.basket?.id ?? emptyUuid) ||
      preview.purchaseFingerprint !== (basket.basket?.purchaseFingerprint ?? '')),
  );
  function close() {
    if (active.current || locked) return;
    setOpen(false);
    setPreview(undefined);
    setFailed(false);
  }
  async function run(work: () => Promise<void>) {
    if (active.current || locked || !basket.canAdd) return;
    active.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await work();
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      active.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return {
    open,
    busy: locked,
    failed,
    preview,
    changed,
    show: () => {
      if (basket.canAdd && !locked) setOpen(true);
    },
    close,
    back: () => {
      if (!active.current && !locked) {
        setPreview(undefined);
        setFailed(false);
      }
    },
    prepare: (target: OrderType) =>
      run(async () => {
        const result = await basket.previewChannel(target);
        if (mounted.current) setPreview(result);
      }),
    confirm: () =>
      run(async () => {
        if (!preview || changed) return;
        await basket.changeChannel({
          expectedBasketId: preview.basketId,
          expectedPurchaseFingerprint: preview.purchaseFingerprint,
          orderType: preview.orderType,
          confirmedConflictItemIds: preview.conflicts.map((row) => row.basketItemId),
        });
        if (mounted.current) {
          setOpen(false);
          setPreview(undefined);
        }
      }),
  };
}
