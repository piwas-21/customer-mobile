import { useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  readOrderHistory,
  type OrderHistoryCursor,
  type OrderHistoryItem,
} from '../../api/orderHistory';
import type { SessionController } from '../../core/sessionController';
import type { TenantContext } from '../../core/tenantContext';
import usePrivatePages from '../../core/usePrivatePages';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { useTheme } from '../../ui/theme';
import { listSummaryStyles as styles } from '../../ui/listSummaryStyles';
import { orderStatusKey } from './orderPresentation';
import HistoryReceiptModal from './HistoryReceiptModal';
type Props = Readonly<{
  context: TenantContext;
  controller: SessionController;
  userId: string;
  ownerVersion: string;
  onClose: () => void;
}>;
export default function OrderHistoryModal({
  context,
  controller,
  userId,
  ownerVersion,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string>();
  const page = usePrivatePages(
    context,
    userId,
    ownerVersion,
    'order-history',
    (cursor?: OrderHistoryCursor) => readOrderHistory(controller, userId, cursor),
    (data) => data.nextBefore,
  );
  const data = page.data;
  if (selected)
    return (
      <HistoryReceiptModal
        context={context}
        controller={controller}
        userId={userId}
        ownerVersion={ownerVersion}
        orderId={selected}
        onBack={() => setSelected(undefined)}
        onClose={onClose}
      />
    );
  let emptyMessage = 'noAccountOrders';
  if (page.loading) emptyMessage = 'loading';
  else if (page.failed) emptyMessage = 'orderHistoryUnavailable';
  return (
    <BaseModal title={t('accountOrderHistory')} onClose={onClose} scroll={false}>
      <FlatList
        data={data?.items ?? []}
        keyExtractor={(item) => item.orderId}
        contentContainerStyle={styles.content}
        renderItem={({ item }) =>
          data ? (
            <HistoryRow
              item={item}
              zone={data.businessTimeZoneId}
              open={() => setSelected(item.orderId)}
            />
          ) : null
        }
        ListHeaderComponent={
          data ? (
            <Feedback message={t('receiptTimeZone', { zone: data.businessTimeZoneId })} />
          ) : null
        }
        ListEmptyComponent={<Feedback loading={page.loading} message={t(emptyMessage)} />}
        ListFooterComponent={
          <View style={styles.content}>
            <Button
              label={t('refreshOrderHistory')}
              secondary
              disabled={page.loading}
              onPress={page.refresh}
            />
            {page.hasPrevious ? (
              <Button
                label={t('previousOrders')}
                secondary
                disabled={page.loading}
                onPress={page.previous}
              />
            ) : null}
            {page.hasNext ? (
              <Button
                label={t('nextOrders')}
                secondary
                disabled={page.loading}
                onPress={page.next}
              />
            ) : null}
          </View>
        }
      />
      <Button label={t('close')} secondary onPress={onClose} />
    </BaseModal>
  );
}
function HistoryRow({
  item,
  zone,
  open,
}: Readonly<{ item: OrderHistoryItem; zone: string; open: () => void }>) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const date = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: zone,
  });
  const price =
    item.currency !== null && item.payableTotal !== null
      ? new Intl.NumberFormat(i18n.language, { style: 'currency', currency: item.currency }).format(
          item.payableTotal,
        )
      : null;
  return (
    <View style={[styles.row, { borderColor: theme.border }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        {t('orderReceipt', { number: item.orderNumber })}
      </Text>
      <Text style={[styles.body, { color: theme.text }]}>
        {t('receiptDate', { date: date.format(new Date(item.orderDate)) })}
      </Text>
      <Text style={[styles.body, { color: theme.text }]}>
        {t(orderStatusKey(item.status, false))}
      </Text>
      <Text style={[styles.body, { color: theme.text }]}>
        {t(orderStatusKey(item.paymentStatus, true))}
      </Text>
      <Text style={[styles.body, { color: theme.secondary }]}>
        {price ? t('historyPayable', { price }) : t('historyAmountUnavailable')}
      </Text>
      <Button
        label={t('viewHistoryReceipt', { number: item.orderNumber })}
        secondary
        onPress={open}
      />
    </View>
  );
}
