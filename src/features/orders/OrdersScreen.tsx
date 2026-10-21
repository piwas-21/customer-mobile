import RoundAttemptNotice from '../tables/RoundAttemptNotice';
import ReservationAttemptNotice from '../reservations/ReservationAttemptNotice';
import CancellationNotice from './CancellationNotice';
import PaymentAttentionNotice from '../payments/PaymentAttentionNotice';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Screen from '../../ui/Screen';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { spacing, typography, useTheme } from '../../ui/theme';
import useOrderReceipts from './useOrderReceipts';
import ReceiptModal from './ReceiptModal';
import PaymentNotice from '../payments/PaymentNotice';
import OrderHistoryControl from './OrderHistoryControl';
export default function OrdersScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const orders = useOrderReceipts();
  const cleanup = orders.session.needsCleanup;
  function savedLabel(item: NonNullable<typeof orders.items>[number]) {
    if (item.outcome === 'Cancelled') return t('stoppedOrderAttempt');
    if (!item.recordedAt) return t('savedOrder');
    const date = new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(item.recordedAt));
    return t('savedOrderAt', { date });
  }
  return (
    <Screen>
      <FlatList
        data={cleanup ? [] : (orders.items ?? [])}
        keyExtractor={(item) => item.operationId}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.content}>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
              {t('orders')}
            </Text>
            <Text style={[styles.body, { color: theme.secondary }]}>{t('savedOrdersIntro')}</Text>
            <OrderHistoryControl />
            <RoundAttemptNotice />
            <PaymentAttentionNotice />
            <PaymentNotice />
            <CancellationNotice />
            <ReservationAttemptNotice />
            {cleanup ? (
              <Feedback
                message={t('accountFailure.logout')}
                retry={() => {
                  void orders.session.controller?.logout().catch(() => undefined);
                }}
              />
            ) : null}
            {orders.actionFailed ? <Feedback message={t('savedOrdersActionFailed')} /> : null}
            {orders.loading ? <Feedback message={t('loading')} loading /> : null}
            {orders.failed || orders.session.failed ? (
              <Feedback
                message={t('savedOrdersFailure')}
                retry={orders.session.failed ? orders.session.retry : orders.refresh}
              />
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <Button
            secondary
            label={savedLabel(item)}
            onPress={() => orders.select(item.operationId)}
          />
        )}
        ListEmptyComponent={
          !orders.loading && !cleanup && !orders.failed ? (
            <Feedback message={t('noSavedOrders')} />
          ) : null
        }
        ListFooterComponent={
          orders.canContinueAsGuest && !cleanup ? (
            <Button
              label={t('continueAsGuest')}
              onPress={() => {
                void orders.continueAsGuest();
              }}
              disabled={orders.busy}
            />
          ) : null
        }
      />
      {orders.selected && !cleanup ? <ReceiptModal key={orders.selected} orders={orders} /> : null}
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.lg },
  title: { fontSize: typography.title, fontWeight: '700' },
  body: { fontSize: typography.body },
});
