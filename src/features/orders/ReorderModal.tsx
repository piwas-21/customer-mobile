import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { customerName } from '../../api/catalogue';
import type { HistoryReceipt } from '../../api/historyReceipt';
import { reorderCandidates, type ReorderCandidate } from '../../domain/reorder';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import { useSession } from '../account/SessionProvider';
import { useBasket } from '../basket/BasketProvider';
import ProductConfiguration from '../menu/ProductConfiguration';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { spacing, typography, useTheme } from '../../ui/theme';
import useReorderProduct from './useReorderProduct';
type Props = Readonly<{ receipt: HistoryReceipt; onBack: () => void; onClose: () => void }>;
export default function ReorderModal({ receipt, onBack, onClose }: Props) {
  const { t } = useTranslation();
  const { context } = useRestaurant();
  const { controller, userId, ownerVersion } = useSession();
  const basket = useBasket();
  const scope = useMemo(
    () => ({ context, controller, userId, ownerVersion, receipt }),
    [context, controller, userId, ownerVersion, receipt],
  );
  const [selection, setSelection] = useState<{
    scope: typeof scope;
    candidate: ReorderCandidate;
  }>();
  const rows = useMemo(() => reorderCandidates(receipt.items), [receipt]);
  const candidate = selection?.scope === scope ? selection.candidate : undefined;
  function back() {
    if (basket.busy) return;
    if (candidate) setSelection(undefined);
    else onBack();
  }
  const added = (navigate: () => void) => {
    navigate();
    onClose();
  };
  if (candidate)
    return <ReorderProduct candidate={candidate} onBasketNavigation={added} onBack={back} />;
  return (
    <BaseModal title={t('reorder.title')} onClose={back} scroll={false}>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<Feedback message={t('reorder.explanation')} />}
        renderItem={({ item }) => (
          <View style={styles.content}>
            <PreviousDish candidate={item} />
            {item.seed ? (
              <Button
                label={t('reorder.choose', { name: item.name })}
                disabled={!basket.canAdd || basket.busy}
                onPress={() => {
                  if (basket.canAdd && !basket.busy) setSelection({ scope, candidate: item });
                }}
              />
            ) : (
              <Feedback message={t('reorder.unavailable')} />
            )}
          </View>
        )}
      />
      <Button secondary label={t('reorder.back')} disabled={basket.busy} onPress={back} />
      <Button
        secondary
        label={t('close')}
        disabled={basket.busy}
        onPress={() => {
          if (!basket.busy) onClose();
        }}
      />
    </BaseModal>
  );
}
function ReorderProduct({
  candidate,
  onBasketNavigation,
  onBack,
}: Readonly<{
  candidate: ReorderCandidate;
  onBasketNavigation: (navigate: () => void) => void;
  onBack: () => void;
}>) {
  const [freshKey] = useState(randomUUID);
  const basket = useBasket();
  const channel = basket.basket?.orderType ?? undefined;
  const current = useReorderProduct(candidate, freshKey, channel);
  const { t, i18n } = useTranslation();
  const product = current.product;
  let content = (
    <Feedback
      loading={current.loading}
      message={t(current.loading ? 'loading' : 'reorder.unavailable')}
      retry={current.failed ? current.refresh : undefined}
    />
  );
  if (product && candidate.seed) {
    content =
      product.isActive &&
      product.isAvailable &&
      product.availability.canOrder &&
      !product.isComponent ? (
        <ProductConfiguration
          product={product}
          channel={channel}
          seed={candidate.seed}
          freshKey={current.freshKey}
          onBasketNavigation={onBasketNavigation}
        />
      ) : (
        <Feedback message={t('reorder.unavailable')} retry={current.refresh} />
      );
  }
  return (
    <BaseModal
      title={product ? customerName(product, i18n.language) : t('reorder.title')}
      onClose={onBack}
      scroll={false}
    >
      {content}
      <Button secondary label={t('reorder.backToDishes')} disabled={basket.busy} onPress={onBack} />
    </BaseModal>
  );
}
function PreviousDish({ candidate }: Readonly<{ candidate: ReorderCandidate }>) {
  const { t } = useTranslation();
  const theme = useTheme();
  const name = candidate.variationName
    ? `${candidate.name} · ${candidate.variationName}`
    : candidate.name;
  return (
    <View style={styles.previous}>
      <Text style={[styles.body, { color: theme.text }]}>
        {t('reorder.previous', { name, quantity: candidate.quantity })}
      </Text>
      {candidate.seed?.instructions ? (
        <Text style={[styles.body, { color: theme.secondary }]}>
          {t('reorder.previousInstructions', { instructions: candidate.seed.instructions })}
        </Text>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.lg },
  body: { fontSize: typography.body },
  previous: { gap: spacing.sm },
});
