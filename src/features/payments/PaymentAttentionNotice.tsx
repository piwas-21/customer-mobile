import { useState } from 'react';
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
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!session.needsPaymentAttention) return null;
  async function separateCustomer() {
    if (busy || !session.controller) return;
    setBusy(true);
    setFailed(false);
    try {
      await session.controller.continueForAnotherCustomer();
      setConfirming(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
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
        onPress={() => setConfirming(true)}
      />
      {confirming ? (
        <BaseModal
          title={t('paymentAttention.separate')}
          onClose={() => {
            if (!busy) setConfirming(false);
          }}
        >
          <Feedback message={t('paymentAttention.confirmation')} />
          {failed ? <Feedback message={t('savedOrdersActionFailed')} /> : null}
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
            onPress={() => setConfirming(false)}
          />
        </BaseModal>
      ) : null}
    </View>
  );
}
