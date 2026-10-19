import { useRef, useState } from 'react';
import type { useBasket } from './BasketProvider';
import useMounted from '../../core/useMounted';
export default function useBasketResolution(basket: ReturnType<typeof useBasket>) {
  const mounted = useMounted();
  const active = useRef(false);
  const [confirm, setConfirm] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = basket.busy || busy;
  async function resolve(cancel: boolean) {
    if (active.current || locked) return;
    active.current = true;
    setBusy(true);
    setFailed(false);
    try {
      if (cancel) await basket.cancel();
      else await basket.recover();
      if (mounted.current) setConfirm(false);
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      active.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const close = () => {
    if (!active.current && !locked) setConfirm(false);
  };
  return { confirm, setConfirm, failed, locked, resolve, close };
}
