import { useTranslation } from 'react-i18next';
import type { CustomerAddress } from '../../api/customerAddresses';
import { changeCustomerAddress } from '../../api/addressManagement';
import type { SessionController } from '../../core/sessionController';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import SavedAddressRow from './SavedAddressRow';
import useAddressWrite from './useAddressWrite';
type Props = Readonly<{
  controller: SessionController;
  userId: string;
  address: CustomerAddress;
  action: 'remove' | 'default';
  onSaved: () => void;
  onCancel: () => void;
}>;
export default function AddressActionConfirmation({
  controller,
  userId,
  address,
  action,
  onSaved,
  onCancel,
}: Props) {
  const { t, i18n } = useTranslation();
  const write = useAddressWrite(controller, userId, onSaved);
  const close = () => {
    if (write.canLeave()) onCancel();
  };
  const label = t(action === 'remove' ? 'removeAddress' : 'makeDefaultAddress');
  return (
    <BaseModal title={label} onClose={close}>
      <SavedAddressRow address={address} />
      <Feedback message={t(action === 'remove' ? 'removeAddressPrompt' : 'defaultAddressPrompt')} />
      {write.failure ? (
        <Feedback
          message={t(write.failure === 'unknown' ? 'addressWriteUnknown' : 'addressWriteRefused')}
        />
      ) : null}
      <Button
        label={label}
        destructive={action === 'remove'}
        busy={write.busy}
        disabled={write.busy || write.failure === 'unknown'}
        onPress={() => {
          void write.run(() =>
            changeCustomerAddress(controller, userId, address.id, action, i18n.language),
          );
        }}
      />
      <Button
        label={t(write.failure === 'unknown' ? 'checkSavedAddresses' : 'cancel')}
        secondary
        disabled={write.busy}
        onPress={close}
      />
    </BaseModal>
  );
}
