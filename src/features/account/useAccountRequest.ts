import { useRef, useState } from 'react';
import type { z } from 'zod';
import useMounted from '../../core/useMounted';
export default function useAccountRequest<T>(
  schema: z.ZodType<T>,
  send: (input: T) => Promise<void>,
  onSettled: () => void,
) {
  const mounted = useMounted();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<'input' | 'request'>();
  async function submit(input: T): Promise<boolean> {
    if (!mounted.current || pending.current) return false;
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      setFailure('input');
      return false;
    }
    pending.current = true;
    setBusy(true);
    setFailure(undefined);
    try {
      await send(parsed.data);
      if (!mounted.current) return false;
      setSent(true);
      return true;
    } catch {
      if (mounted.current) setFailure('request');
      return false;
    } finally {
      pending.current = false;
      if (mounted.current) {
        setBusy(false);
        onSettled();
      }
    }
  }
  return { submit, busy, sent, failure, canLeave: () => mounted.current && !pending.current };
}
