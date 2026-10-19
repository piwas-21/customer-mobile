import { useEffect, useState } from 'react';
import { BackHandler, Keyboard, StyleSheet, Text, View } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ProductDetail } from '../../api/productDetail';
import { projectProductComposition } from '../../domain/productComposition';
import useMounted from '../../core/useMounted';
import { useBasket } from '../basket/BasketProvider';
import useProductDraft from './useProductDraft';
import ProductStep from './ProductStep';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { spacing, typography, useTheme } from '../../ui/theme';
export default function GuidedProduct({
  product,
  details,
}: Readonly<{
  product: ProductDetail;
  details: ReadonlyMap<string, ProductDetail>;
}>) {
  const draft = useProductDraft(product, details);
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
      if (draft.index < 1) return false;
      draft.back();
      return true;
    });
    return () => subscription.remove();
  }, [busy, draft]);
  async function add() {
    if (!draft.selection || !draft.valid || !basket.canAdd) return;
    Keyboard.dismiss();
    setFailed(false);
    try {
      await basket.add(projectProductComposition(product, details, draft.selection));
      if (mounted.current) router.replace('/basket');
    } catch {
      if (mounted.current) setFailed(true);
    }
  }
  if (!draft.plan || !draft.step) return <Feedback message={t('webHelp')} />;
  const review = draft.step.kind === 'review';
  return (
    <>
      <Stack.Screen options={{ gestureEnabled: !busy, headerBackVisible: !busy }} />
      <Text accessibilityLiveRegion="polite" style={[styles.progress, { color: theme.secondary }]}>
        {t('stepProgress', { current: draft.index + 1, total: draft.plan.steps.length })}
      </Text>
      {draft.changed ? (
        <Text accessibilityRole="alert" style={{ color: theme.secondary }}>
          {t('menuChanged')}
        </Text>
      ) : null}
      <View style={styles.step}>
        <ProductStep product={product} draft={draft} disabled={busy} />
      </View>
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
        {draft.index > 0 ? (
          <View style={styles.back}>
            <Button
              secondary
              label={t('back')}
              disabled={busy}
              onPress={() => {
                Keyboard.dismiss();
                draft.back();
              }}
            />
          </View>
        ) : null}
        <View style={styles.primary}>
          <Button
            label={t(review ? 'addToBasket' : 'next')}
            busy={busy}
            disabled={review ? !draft.valid || !basket.canAdd : !draft.complete}
            onPress={
              review
                ? () => {
                    void add();
                  }
                : () => {
                    Keyboard.dismiss();
                    draft.next();
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
