import { useMemo } from 'react';
import { FlatList, Text, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TableRoundReviewView } from '../../core/tableRoundController';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import MoneySummary from '../../ui/MoneySummary';
import { spacing, typography, useTheme } from '../../ui/theme';
import { receiptRows } from '../orders/receiptRows';
import BasketLine from '../basket/BasketLine';
export default function RoundReviewModal({
  review,
  busy,
  onClose,
  onConfirm,
}: Readonly<{
  review: TableRoundReviewView;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}>) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const rows = useMemo(() => receiptRows(review.quote.items), [review.quote.items]);
  const price = (amount: number) =>
    new Intl.NumberFormat(i18n.language, {
      style: 'currency',
      currency: review.quote.currency,
    }).format(amount);
  return (
    <BaseModal title={t('tableRoundReview')} onClose={onClose} scroll={false}>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={({ item }) => (
          <BasketLine row={item} price={price} edit={() => undefined} disabled />
        )}
        ListHeaderComponent={
          <View style={styles.content}>
            {review.tableLabel ? (
              <Text style={[styles.body, { color: theme.text }]}>
                {t('tableAt', { label: review.tableLabel })}
              </Text>
            ) : null}
            <Feedback
              message={t(review.quote.priceChanged ? 'checkoutPriceChanged' : 'serverPricedBasket')}
            />
            <Feedback message={t('tableRoundSubmitHint')} />
          </View>
        }
        ListFooterComponent={
          <View style={styles.content}>
            <MoneySummary value={review.quote.money} price={price} />
            <Button label={t('tableRoundSend')} onPress={onConfirm} busy={busy} />
            <Button label={t('close')} secondary onPress={onClose} disabled={busy} />
          </View>
        }
      />
    </BaseModal>
  );
}
const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingVertical: spacing.md },
  body: { fontSize: typography.body },
});
