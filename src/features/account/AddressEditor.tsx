import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { addressTextLimits, type CustomerAddress } from '../../api/customerAddresses';
import {
  addressInputSchema,
  requiredAddressFields,
  saveCustomerAddress,
  type AddressInput,
} from '../../api/addressManagement';
import type { SessionController } from '../../core/sessionController';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import Field from '../../ui/Field';
import { spacing, typography, useTheme } from '../../ui/theme';
import useAddressWrite from './useAddressWrite';
type Props = Readonly<{
  controller: SessionController;
  userId: string;
  address?: CustomerAddress;
  onSaved: () => void;
  onCancel: () => void;
}>;
const requiredFields: readonly string[] = requiredAddressFields;
function initialContent(address?: CustomerAddress): AddressInput {
  return {
    label: address?.label ?? '',
    addressLine1: address?.addressLine1 ?? '',
    addressLine2: address?.addressLine2 ?? null,
    city: address?.city ?? '',
    state: address?.state ?? null,
    postalCode: address?.postalCode ?? '',
    country: address?.country ?? '',
    phone: address?.phone ?? null,
    deliveryInstructions: address?.deliveryInstructions ?? null,
    isDefault: address?.isDefault ?? false,
  };
}

export default function AddressEditor({ controller, userId, address, onSaved, onCancel }: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const [input, setInput] = useState<AddressInput>(() => initialContent(address));
  const [showErrors, setShowErrors] = useState(false);
  const write = useAddressWrite(controller, userId, onSaved);
  const parsed = addressInputSchema.safeParse(input);
  const locked = write.busy || write.failure === 'unknown';
  const close = () => {
    if (write.canLeave()) onCancel();
  };
  function save() {
    Keyboard.dismiss();
    setShowErrors(true);
    if (parsed.success)
      void write.run(() =>
        saveCustomerAddress(controller, userId, parsed.data, i18n.language, address?.id),
      );
  }
  return (
    <BaseModal title={t(address ? 'editAddress' : 'addAddress')} onClose={close}>
      {Object.entries(addressTextLimits).map(([key, limit]) => {
        const field = key as keyof typeof addressTextLimits;
        const invalid =
          showErrors &&
          !parsed.success &&
          parsed.error.issues.some((issue) => issue.path[0] === field);
        return (
          <Field
            key={field}
            label={t(`addressFields.${field}`)}
            value={input[field] ?? ''}
            editable={!locked}
            maxLength={limit * 2}
            autoCapitalize={field === 'phone' ? 'none' : 'sentences'}
            keyboardType={field === 'phone' ? 'phone-pad' : 'default'}
            multiline={field === 'deliveryInstructions'}
            {...(invalid ? { error: t('addressFieldInvalid', { count: limit }) } : {})}
            onChangeText={(value) =>
              setInput((current) => ({
                ...current,
                [field]: value || (requiredFields.includes(field) ? '' : null),
              }))
            }
          />
        );
      })}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={t('makeDefaultAddress')}
        accessibilityState={{ checked: input.isDefault, disabled: locked }}
        disabled={locked}
        onPress={() => setInput((current) => ({ ...current, isDefault: !current.isDefault }))}
        style={[styles.default, { borderColor: theme.border }]}
      >
        <Text style={[styles.label, { color: theme.text }]}>{t('makeDefaultAddress')}</Text>
        <Text accessible={false} style={{ color: theme.accent }}>
          {input.isDefault ? '✓' : '○'}
        </Text>
      </Pressable>
      {write.failure ? (
        <Feedback
          message={t(write.failure === 'unknown' ? 'addressWriteUnknown' : 'addressWriteRefused')}
        />
      ) : null}
      <Button label={t('saveAddress')} disabled={locked} busy={write.busy} onPress={save} />
      <Button
        label={t(write.failure === 'unknown' ? 'checkSavedAddresses' : 'cancel')}
        secondary
        disabled={write.busy}
        onPress={close}
      />
    </BaseModal>
  );
}
const styles = StyleSheet.create({
  default: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
  },
  label: { flex: 1, fontSize: typography.body },
});
