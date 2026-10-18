import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { spacing, typography, useTheme } from '../../ui/theme';
import type { AccountState } from './useAccount';
function ProfileDetails({ profile }: Readonly<Pick<AccountState, 'profile'>>) {
  const { t } = useTranslation();
  const theme = useTheme();
  if (profile.isPending) return <Feedback message={t('loading')} loading />;
  if (profile.isError || !profile.data)
    return (
      <Feedback
        message={t('profileUnavailable')}
        retry={() => {
          void profile.refetch();
        }}
      />
    );
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>
        {profile.data.firstName} {profile.data.lastName}
      </Text>
      <Text selectable style={[styles.body, { color: theme.text }]}>
        {profile.data.email}
      </Text>
      {profile.data.phoneNumber ? (
        <Text selectable style={[styles.body, { color: theme.text }]}>
          {profile.data.phoneNumber}
        </Text>
      ) : null}
      {!profile.data.isEmailConfirmed ? <Feedback message={t('verificationRequired')} /> : null}
    </View>
  );
}
export default function ProfileCard({
  profile,
  busy,
  logout,
}: Readonly<Pick<AccountState, 'profile' | 'busy' | 'logout'>>) {
  const { t } = useTranslation();
  return (
    <View style={styles.section}>
      <ProfileDetails profile={profile} />
      <Button
        label={t('signOut')}
        onPress={() => {
          void logout();
        }}
        busy={busy}
        secondary
      />
    </View>
  );
}
const styles = StyleSheet.create({
  section: { gap: spacing.md },
  heading: { fontSize: typography.heading, fontWeight: '600' },
  body: { fontSize: typography.body, lineHeight: 26 },
});
