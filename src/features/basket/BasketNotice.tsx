import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { useBasket } from './BasketProvider';
import useMounted from '../../core/useMounted';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { spacing, typography, useTheme } from '../../ui/theme';
export default function BasketNotice({
  basket,
}: Readonly<{ basket: ReturnType<typeof useBasket> }>) {
  const { t } = useTranslation();
  const theme = useTheme();
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
  return (
    <View style={styles.notice}>
      {basket.resolution ? (
        <Text accessibilityRole="alert" style={[styles.body, { color: theme.text }]}>
          {t(basket.resolution === 'Applied' ? 'basketAlreadyApplied' : 'basketCancelled')}
        </Text>
      ) : null}
      {basket.hasPending ? (
        <>
          <Text accessibilityRole="alert" style={[styles.body, { color: theme.secondary }]}>
            {t(basket.cancelling ? 'basketCancelling' : 'basketPending')}
          </Text>
          {!basket.cancelling ? (
            <Button
              label={t('recoverBasket')}
              busy={locked}
              onPress={() => {
                void resolve(false);
              }}
            />
          ) : null}
          <Button
            secondary
            label={t(basket.cancelling ? 'finishBasketCancellation' : 'stopBasketRetry')}
            busy={locked}
            onPress={() => setConfirm(true)}
          />
          {failed ? <Feedback message={t('basketResolutionFailed')} /> : null}
          {confirm ? (
            <BaseModal title={t('stopBasketRetry')} onClose={close}>
              <Text style={[styles.body, { color: theme.text }]}>
                {t('basketCancelExplanation')}
              </Text>
              {failed ? <Feedback message={t('basketResolutionFailed')} /> : null}
              <Button
                label={t(
                  basket.cancelling ? 'finishBasketCancellation' : 'confirmBasketCancellation',
                )}
                busy={locked}
                onPress={() => {
                  void resolve(true);
                }}
              />
              <Button secondary label={t('back')} disabled={locked} onPress={close} />
            </BaseModal>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  notice: { gap: spacing.md },
  body: { fontSize: typography.body },
});
