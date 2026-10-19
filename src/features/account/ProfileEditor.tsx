import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { QueryKey } from '@tanstack/react-query';
import type { CustomerProfile } from '../../api/profile';
import type { SessionController } from '../../core/sessionController';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Field from '../../ui/Field';
import Feedback from '../../ui/Feedback';
import { typography, useTheme } from '../../ui/theme';
import useProfileEdit from './useProfileEdit';
type Props = Readonly<{
  profile: CustomerProfile;
  controller: SessionController;
  queryKey: QueryKey;
  onSaved: () => void;
  onCancel: () => void;
}>;
export default function ProfileEditor({ profile, controller, queryKey, onSaved, onCancel }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const form = useProfileEdit(profile, controller, queryKey, onSaved, onCancel);
  const error = (field: string) =>
    form.invalid(field)
      ? { error: t(field === 'phoneNumber' ? 'profilePhoneInvalid' : 'profileNameInvalid') }
      : {};
  return (
    <BaseModal title={t('editProfile')} onClose={form.cancel}>
      <Text style={[styles.hint, { color: theme.secondary }]}>{t('profileNameHint')}</Text>
      <Field
        label={t('firstName')}
        value={form.firstName}
        onChangeText={form.setFirstName}
        textContentType="givenName"
        autoComplete="given-name"
        maxLength={100}
        autoFocus
        editable={!form.busy}
        {...error('firstName')}
      />
      <Field
        label={t('lastName')}
        value={form.lastName}
        onChangeText={form.setLastName}
        textContentType="familyName"
        autoComplete="family-name"
        maxLength={100}
        editable={!form.busy}
        {...error('lastName')}
      />
      <Text style={[styles.hint, { color: theme.secondary }]}>{t('profilePhoneHint')}</Text>
      <Field
        label={t('phoneNumber')}
        value={form.phoneNumber}
        onChangeText={form.setPhoneNumber}
        textContentType="telephoneNumber"
        autoComplete="tel"
        keyboardType="phone-pad"
        maxLength={16}
        editable={!form.busy}
        {...error('phoneNumber')}
      />
      {form.failure === 'request' ? <Feedback message={t('profileSaveFailed')} /> : null}
      <Button
        label={t('saveProfile')}
        onPress={() => {
          void form.save();
        }}
        busy={form.busy}
      />
      <Button label={t('cancel')} onPress={form.cancel} secondary disabled={form.busy} />
    </BaseModal>
  );
}
const styles = StyleSheet.create({ hint: { fontSize: typography.body, lineHeight: 26 } });
