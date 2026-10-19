import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { useBasket } from './BasketProvider';
import useBasketResolution from './useBasketResolution';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { spacing, typography, useTheme } from '../../ui/theme';
export default function BasketNotice({
  basket,
}: Readonly<{ basket: ReturnType<typeof useBasket> }>) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { confirm, setConfirm, failed, locked, resolve, close } = useBasketResolution(basket);
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
