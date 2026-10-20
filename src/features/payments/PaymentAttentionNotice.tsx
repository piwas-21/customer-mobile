import type { SessionController } from '../../core/sessionController';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSession } from '../account/SessionProvider';
import BaseModal from '../../ui/BaseModal';
import Feedback from '../../ui/Feedback';
import Button from '../../ui/Button';
export default function PaymentAttentionNotice({
  account = false,
}: Readonly<{ account?: boolean }>) {
  const session = useSession();
  const router = useRouter();
  const { t } = useTranslation();
  const scope = useMemo(
    () => ({ controller: session.controller, version: session.ownerVersion }),
    [session.controller, session.ownerVersion],
  );
  const current = useRef<typeof scope | undefined>(undefined);
  useLayoutEffect(() => {
    current.current = scope;
    return () => {
      current.current = undefined;
    };
  }, [scope]);
  const [confirming, setConfirming] = useState<typeof scope>();
  const inFlight = useRef(new WeakSet<SessionController>());
  const [active, setActive] = useState<ReadonlySet<SessionController>>(() => new Set());
  const [failed, setFailed] = useState<typeof scope>();
  const busy = Boolean(scope.controller && active.has(scope.controller));
  if (!session.needsPaymentAttention) return null;
  async function separateCustomer() {
    const controller = scope.controller;
    if (
      current.current !== scope ||
      busy ||
      confirming !== scope ||
      !controller ||
      inFlight.current.has(controller) ||
      controller.ownerVersion !== scope.version ||
      !controller.needsPaymentAttention
    )
      return;
    inFlight.current.add(controller);
    setActive((value) => new Set(value).add(controller));
    setFailed(undefined);
    try {
      await controller.continueForAnotherCustomer();
      setConfirming((value) => (value === scope ? undefined : value));
    } catch {
      if (current.current === scope) setFailed(scope);
    } finally {
      inFlight.current.delete(controller);
      setActive((value) => {
        const next = new Set(value);
        next.delete(controller);
        return next;
      });
    }
  }
  return (
    <View>
      <Feedback
        message={t(
          session.unavailable ? 'paymentAttention.accountsUnavailable' : 'paymentAttention.message',
        )}
      />
      {!account && !session.unavailable ? (
        <Button label={t('paymentAttention.signIn')} onPress={() => router.push('/account')} />
      ) : null}
      <Button
        secondary
        label={t('paymentAttention.separate')}
        disabled={busy}
        onPress={() => setConfirming(scope)}
      />
      {confirming === scope ? (
        <BaseModal
          title={t('paymentAttention.separate')}
          onClose={() => {
            if (!busy) setConfirming(undefined);
          }}
        >
          <Feedback message={t('paymentAttention.confirmation')} />
          {failed === scope ? <Feedback message={t('savedOrdersActionFailed')} /> : null}
          <Button
            label={t('paymentAttention.confirm')}
            busy={busy}
            onPress={() => {
              void separateCustomer();
            }}
          />
          <Button
            secondary
            label={t('paymentAttention.keep')}
            disabled={busy}
            onPress={() => setConfirming(undefined)}
          />
        </BaseModal>
      ) : null}
    </View>
  );
}
