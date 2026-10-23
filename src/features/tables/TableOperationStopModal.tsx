import { useTranslation } from 'react-i18next';
import BaseModal from '../../ui/BaseModal';
import Feedback from '../../ui/Feedback';
import Button from '../../ui/Button';
export default function TableOperationStopModal({
  title,
  hint,
  confirmLabel,
  busy,
  onClose,
  onConfirm,
}: Readonly<{
  title: string;
  hint: string;
  confirmLabel: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}>) {
  const { t } = useTranslation();
  return (
    <BaseModal title={title} onClose={onClose}>
      <Feedback message={hint} />
      <Button label={confirmLabel} disabled={busy} onPress={onConfirm} />
      <Button label={t('back')} secondary onPress={onClose} />
    </BaseModal>
  );
}
