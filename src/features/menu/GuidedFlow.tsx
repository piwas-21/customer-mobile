import { useEffect, useState, type ReactNode } from 'react';
import { BackHandler, Keyboard, StyleSheet, Text, View } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import useMounted from '../../core/useMounted';
import { useBasket } from '../basket/BasketProvider';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { spacing, typography, useTheme } from '../../ui/theme';
export default function GuidedFlow({
  available = true,
  index,
  total,
  changed,
  complete,
  valid,
  review,
  back,
  next,
  submit,
  children,
}: Readonly<{
  available?: boolean;
  index: number;
  total: number;
  changed: boolean;
  complete: boolean;
  valid: boolean;
  review: boolean;
  back: () => void;
  next: () => void;
  submit: () => Promise<void>;
  children: ReactNode;
}>) {
  const basket = useBasket();
  const router = useRouter();
  const mounted = useMounted();
  const { t } = useTranslation();
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  const busy = basket.busy;
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (busy) return true;
      if (index < 1) return false;
      back();
      return true;
    });
    return () => subscription.remove();
  }, [busy, index, back]);
  async function add() {
    if (!available || !valid || !basket.canAdd) return;
    Keyboard.dismiss();
    setFailed(false);
    try {
      await submit();
      if (mounted.current) router.replace('/basket');
    } catch {
      if (mounted.current) setFailed(true);
    }
  }
  if (!available) return <Feedback message={t('webHelp')} />;
  return (
    <>
      <Stack.Screen options={{ gestureEnabled: !busy, headerBackVisible: !busy }} />
      <Text accessibilityLiveRegion="polite" style={[styles.progress, { color: theme.secondary }]}>
        {t('stepProgress', { current: index + 1, total })}
      </Text>
      {changed ? (
        <Text accessibilityRole="alert" style={{ color: theme.secondary }}>
          {t('menuChanged')}
        </Text>
      ) : null}
      <View style={styles.step}>{children}</View>
      {failed || basket.hasPending ? (
        <Text accessibilityRole="alert" style={{ color: theme.danger }}>
          {t(basket.hasPending ? 'basketPending' : 'basketAddFailed')}
        </Text>
      ) : null}
      {basket.hasPending || failed ? (
        <Button
          secondary
          label={t('openBasket')}
          disabled={busy}
          onPress={() => router.push('/basket')}
        />
      ) : null}
      <View style={styles.actions}>
        {index > 0 ? (
          <View style={styles.back}>
            <Button
              secondary
              label={t('back')}
              disabled={busy}
              onPress={() => {
                Keyboard.dismiss();
                back();
              }}
            />
          </View>
        ) : null}
        <View style={styles.primary}>
          <Button
            label={t(review ? 'addToBasket' : 'next')}
            busy={busy}
            disabled={review ? !valid || !basket.canAdd : !complete}
            onPress={
              review
                ? () => {
                    void add();
                  }
                : () => {
                    Keyboard.dismiss();
                    next();
                  }
            }
          />
        </View>
      </View>
    </>
  );
}
const styles = StyleSheet.create({
  progress: { fontSize: typography.small },
  step: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.md, paddingBottom: spacing.sm },
  back: { flex: 1 },
  primary: { flex: 2 },
});
