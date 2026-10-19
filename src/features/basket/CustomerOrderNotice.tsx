import { View, StyleSheet } from 'react-native';
import { spacing, useTheme } from '../../ui/theme';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { useBasket } from './BasketProvider';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import BaseModal from '../../ui/BaseModal';
export default function CustomerOrderNotice({
  basket,
}: Readonly<{ basket: ReturnType<typeof useBasket> }>) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [confirm, setConfirm] = useState(false);
  const pending = basket.pendingOrder;
  const decision = basket.orderDecision;
  async function resolve(cancel: boolean) {
    try {
      await (cancel ? basket.cancelOrder() : basket.recoverOrder());
    } catch {
      /* Owner state retains the pending proof. */
    }
    setConfirm(false);
  }
  if (!pending && !decision) return null;
  return (
    <View style={[styles.notice, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {decision?.outcome === 'Applied' ? <Feedback message={t('orderReceived')} /> : null}
      {decision?.outcome === 'Cancelled' ? <Feedback message={t('orderAttemptCancelled')} /> : null}
      {pending ? (
        <>
          <Feedback
            message={t(pending.cancelling ? 'orderCancellationPending' : 'orderOutcomePending')}
          />
          <Button
            label={t(pending.cancelling ? 'finishOrderCheck' : 'checkOrder')}
            busy={basket.busy}
            onPress={() => void resolve(false)}
          />
          {!pending.cancelling ? (
            <Button
              label={t('stopOrderAttempt')}
              secondary
              disabled={basket.busy}
              onPress={() => setConfirm(true)}
            />
          ) : null}
        </>
      ) : null}
      {confirm && pending ? (
        <BaseModal
          title={t('stopOrderAttempt')}
          onClose={() => {
            if (!basket.busy) setConfirm(false);
          }}
        >
          <Feedback message={t('stopOrderExplanation')} />
          <Button
            label={t('confirmStopOrder')}
            busy={basket.busy}
            onPress={() => void resolve(true)}
          />
          <Button
            label={t('keepCheckingOrder')}
            secondary
            disabled={basket.busy}
            onPress={() => setConfirm(false)}
          />
        </BaseModal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    gap: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderRadius: 12,
  },
});
