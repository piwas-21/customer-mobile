import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  readAccountDeletion,
  requestAccountDeletion,
  type AccountDeletionStatus,
} from '../../api/accountDeletion';
import type { SessionController } from '../../core/sessionController';
export default function useAccountDeletion(controller: SessionController, userId: string) {
  const { i18n } = useTranslation();
  const mounted = useRef(false);
  const running = useRef(false);
  const [status, setStatus] = useState<AccountDeletionStatus>();
  const [busy, setBusy] = useState(true);
  const [failure, setFailure] = useState<'read' | 'unknown'>();
  const settleRead = useCallback((status?: AccountDeletionStatus) => {
    if (!mounted.current) return;
    setStatus(status);
    setFailure(status ? undefined : 'read');
    running.current = false;
    setBusy(false);
  }, []);
  const check = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setStatus(undefined);
    setFailure(undefined);
    try {
      settleRead(await readAccountDeletion(controller, userId));
    } catch {
      settleRead();
    }
  }, [controller, userId, settleRead]);
  useEffect(() => {
    let active = true;
    mounted.current = true;
    running.current = true;
    void readAccountDeletion(controller, userId).then(
      (status) => {
        if (active) settleRead(status);
      },
      () => {
        if (active) settleRead();
      },
    );
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => {
      active = false;
      mounted.current = false;
      subscription.remove();
    };
  }, [controller, userId, settleRead, check]);
  async function request() {
    if (running.current || status?.state !== 'not-requested' || failure) return;
    running.current = true;
    setBusy(true);
    setStatus(undefined);
    try {
      const current = await requestAccountDeletion(controller, userId, i18n.language);
      if (mounted.current) setStatus(current);
    } catch {
      if (mounted.current) setFailure('unknown');
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return { status, busy, failure, check, request };
}
