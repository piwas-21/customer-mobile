import { useRef, useState } from 'react';
import { ApiFailure } from '../../core/transport';
import type { SessionController } from '../../core/sessionController';
import useMounted from '../../core/useMounted';
export default function useAddressWrite(
  controller: SessionController,
  userId: string,
  onSaved: () => void,
) {
  const mounted = useMounted();
  const running = useRef(false);
  const unknown = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<'refused' | 'unknown'>();
  async function run(effect: () => Promise<unknown>): Promise<void> {
    if (!mounted.current || running.current || unknown.current) return;
    running.current = true;
    setBusy(true);
    setFailure(undefined);
    try {
      const guard = controller.captureRequestOwner({ kind: 'customer', id: userId });
      await effect();
      guard();
      if (mounted.current) onSaved();
    } catch (error) {
      const refused =
        error instanceof ApiFailure &&
        error.reason === 'http' &&
        [400, 401, 403, 404, 409, 422, 429].includes(error.status);
      unknown.current = !refused;
      if (mounted.current) setFailure(refused ? 'refused' : 'unknown');
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return { busy, failure, run, canLeave: () => mounted.current && !running.current };
}
