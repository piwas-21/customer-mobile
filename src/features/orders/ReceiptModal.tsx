import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import BasketLine from '../basket/BasketLine';
import type useOrderReceipts from './useOrderReceipts';
import ReceiptSummary from './ReceiptSummary';
import { receiptFormatters } from './orderPresentation';
import { receiptRows } from './receiptRows';
export default function ReceiptModal({
  orders,
}: Readonly<{ orders: ReturnType<typeof useOrderReceipts> }>) {
  const { t, i18n } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  const value = orders.receipt;
  const rows = useMemo(() => (value ? receiptRows(value.items) : []), [value]);
  const format = value ? receiptFormatters(value, i18n.language) : undefined;
  return (
    <BaseModal title={t('savedOrder')} onClose={orders.close} scroll={false}>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={({ item }) => (
          <BasketLine row={item} price={format!.price} edit={() => undefined} disabled />
        )}
        ListHeaderComponent={
          <View>
            {value ? <ReceiptSummary value={value} /> : null}
            {orders.item?.outcome === 'Cancelled' ? (
              <Feedback message={t('stoppedOrderAttempt')} />
            ) : null}
            {orders.receiptLoading ? <Feedback message={t('loading')} loading /> : null}
            {orders.receiptFailed ? (
              <Feedback message={t('receiptUnavailable')} retry={orders.refreshReceipt} />
            ) : null}
          </View>
        }
        ListFooterComponent={
          <View>
            {orders.item?.outcome === 'Applied' ? (
              <Button
                label={t('refreshReceipt')}
                onPress={orders.refreshReceipt}
                disabled={orders.busy || orders.receiptLoading}
              />
            ) : null}
            {orders.actionFailed ? <Feedback message={t('savedOrdersActionFailed')} /> : null}
            {confirm ? (
              <View>
                <Feedback message={t('removeLocalOrderExplanation')} />
                <Button
                  label={t('confirmRemoveLocalOrder')}
                  onPress={() => {
                    void orders.forget();
                  }}
                  disabled={orders.busy}
                />
                <Button
                  secondary
                  label={t('keepLocalOrder')}
                  onPress={() => setConfirm(false)}
                  disabled={orders.busy}
                />
              </View>
            ) : (
              <Button
                secondary
                label={t('removeLocalOrder')}
                onPress={() => setConfirm(true)}
                disabled={orders.busy}
              />
            )}
          </View>
        }
      />
      <Button secondary label={t('close')} onPress={orders.close} />
    </BaseModal>
  );
}
