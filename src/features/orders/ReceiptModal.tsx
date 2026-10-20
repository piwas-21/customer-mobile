import type { HistoryReceipt } from '../../api/historyReceipt';
import ReorderEntry from './ReorderEntry';
import ReorderModal from './ReorderModal';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import type useOrderReceipts from './useOrderReceipts';
import ReceiptContent from './ReceiptContent';
export default function ReceiptModal({
  orders,
}: Readonly<{ orders: ReturnType<typeof useOrderReceipts> }>) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  const [reorder, setReorder] = useState<HistoryReceipt>();
  if (
    reorder === orders.receipt &&
    orders.receipt &&
    !orders.receiptLoading &&
    !orders.receiptFailed
  )
    return (
      <ReorderModal
        receipt={orders.receipt}
        onBack={() => setReorder(undefined)}
        onClose={orders.close}
      />
    );
  return (
    <BaseModal title={t('savedOrder')} onClose={orders.close} scroll={false}>
      <ReceiptContent
        value={orders.receipt}
        loading={orders.receiptLoading}
        failed={orders.receiptFailed}
        retry={orders.refreshReceipt}
        header={
          orders.item?.outcome === 'Cancelled' ? (
            <Feedback message={t('stoppedOrderAttempt')} />
          ) : null
        }
        footer={
          <View>
            {orders.item?.outcome === 'Applied' ? (
              <Button
                label={t('refreshReceipt')}
                onPress={orders.refreshReceipt}
                disabled={orders.busy || orders.receiptLoading}
              />
            ) : null}
            {orders.receipt && !orders.receiptLoading && !orders.receiptFailed ? (
              <ReorderEntry disabled={orders.busy} onPress={() => setReorder(orders.receipt)} />
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
