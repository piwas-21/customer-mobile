import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { readHistoryReceipt } from '../../api/historyReceipt';
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
  return (
    <BaseModal title={t('savedOrder')} onClose={props.onClose} scroll={false}>
      <ReceiptContent
        value={page.data}
        loading={page.loading}
        failed={page.failed}
        retry={page.refresh}
        footer={
          <View>
            <Button label={t('refreshReceipt')} disabled={page.loading} onPress={page.refresh} />
            <Button label={t('backToOrderHistory')} secondary onPress={props.onBack} />
          </View>
        }
      />
      <Button label={t('close')} secondary onPress={props.onClose} />
    </BaseModal>
  );
}
