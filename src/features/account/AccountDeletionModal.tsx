import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { CustomerProfile } from '../../api/profile';
import type { SessionController } from '../../core/sessionController';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { typography, useTheme } from '../../ui/theme';
import useAccountDeletion from './useAccountDeletion';
type Props = Readonly<{
  profile: CustomerProfile;
  controller: SessionController;
  restaurant: string;
  onClose: () => void;
  logout: () => Promise<void>;
}>;
export default function AccountDeletionModal({
  profile,
  controller,
  restaurant,
  onClose,
  logout,
}: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const form = useAccountDeletion(controller, profile.id);
  const close = () => {
    if (!form.busy) onClose();
  };
  const paragraph = [styles.body, { color: theme.text }];
  return (
    <BaseModal title={t('deletionTitle', { restaurant })} onClose={close}>
      <Text style={paragraph}>{t('deletionIdentity', { email: profile.email, restaurant })}</Text>
      <Text style={paragraph}>{t('deletionTiming')}</Text>
      <Text style={paragraph}>{t('deletionRetention')}</Text>
      {form.busy ? <Feedback message={t('loading')} loading /> : null}
      {form.failure ? (
        <Feedback
          message={t(form.failure === 'unknown' ? 'deletionUnknown' : 'deletionReadFailed')}
        />
      ) : null}
      {form.status?.state === 'scheduled' ? (
        <>
          <Feedback
            message={t('deletionScheduled', {
              date: new Intl.DateTimeFormat(i18n.language, {
                dateStyle: 'long',
                timeStyle: 'short',
              }).format(new Date(form.status.scheduledAtUtc)),
            })}
          />
          <Text style={paragraph}>{t('deletionEmail')}</Text>
          <Button
            label={t('deletionSignOut')}
            onPress={() => {
              void logout();
            }}
            secondary
          />
        </>
      ) : null}
      {form.status?.state === 'not-requested' && !form.failure ? (
        <Button
          label={t('confirmDeletion')}
          busy={form.busy}
          destructive
          onPress={() => {
            void form.request();
          }}
        />
      ) : null}
      <Button
        label={t('checkDeletion')}
        busy={form.busy}
        secondary
        onPress={() => {
          void form.check();
        }}
      />
      <Button
        label={t(form.status?.state === 'scheduled' ? 'close' : 'keepAccount')}
        disabled={form.busy}
        secondary
        onPress={close}
      />
    </BaseModal>
  );
}
const styles = StyleSheet.create({ body: { fontSize: typography.body, lineHeight: 26 } });
