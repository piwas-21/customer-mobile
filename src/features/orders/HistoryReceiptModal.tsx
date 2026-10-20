import { useState } from 'react';
import ReorderEntry from './ReorderEntry';
import ReorderModal from './ReorderModal';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { type HistoryReceipt, readHistoryReceipt } from '../../api/historyReceipt';
import type { SessionController } from '../../core/sessionController';
import type { TenantContext } from '../../core/tenantContext';
import usePrivatePages from '../../core/usePrivatePages';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import ReceiptContent from './ReceiptContent';
type Props = Readonly<{
  context: TenantContext;
  controller: SessionController;
  userId: string;
  ownerVersion: string;
  orderId: string;
  onBack: () => void;
  onClose: () => void;
}>;
export default function HistoryReceiptModal(props: Props) {
  const { t } = useTranslation();
  const page = usePrivatePages(
    props.context,
    props.userId,
    props.ownerVersion,
    'history-receipt/' + props.orderId,
    () => readHistoryReceipt(props.controller, props.userId, props.orderId),
    () => null,
  );
  const [reorder, setReorder] = useState<HistoryReceipt>();
  if (reorder === page.data && page.data && !page.loading && !page.failed)
    return (
      <ReorderModal
        receipt={page.data}
        onBack={() => setReorder(undefined)}
        onClose={props.onClose}
      />
    );
  return (
    <BaseModal title={t('savedOrder')} onClose={props.onClose} scroll={false}>
      <ReceiptContent
        value={page.data}
        loading={page.loading}
        failed={page.failed}
        retry={page.refresh}
        footer={
          <View>
            {page.data && !page.loading && !page.failed ? (
              <ReorderEntry onPress={() => setReorder(page.data)} />
            ) : null}
            <Button label={t('refreshReceipt')} disabled={page.loading} onPress={page.refresh} />
            <Button label={t('backToOrderHistory')} secondary onPress={props.onBack} />
          </View>
        }
      />
      <Button label={t('close')} secondary onPress={props.onClose} />
    </BaseModal>
  );
}
