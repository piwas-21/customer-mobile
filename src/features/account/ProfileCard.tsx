import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { spacing, typography, useTheme } from '../../ui/theme';
import type { AccountState } from './useAccount';
import ProfileEditor from './ProfileEditor';
import AccountDeletionModal from './AccountDeletionModal';
import SavedAddressesModal from './SavedAddressesModal';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import LoyaltyControl from '../loyalty/LoyaltyControl';
import ReservationHistoryControl from '../reservations/ReservationHistoryControl';
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
  session,
  profileQueryKey,
}: Readonly<Pick<AccountState, 'profile' | 'busy' | 'logout' | 'session' | 'profileQueryKey'>>) {
  const { t } = useTranslation();
  const { context } = useRestaurant();
  const [addressesOpen, setAddressesOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <View style={styles.section}>
      <ProfileDetails profile={profile} />
      {saved ? <Feedback message={t('profileSaved')} /> : null}
      <ReservationHistoryControl />
      <LoyaltyControl />
      {profile.data && !profile.isError && session.controller ? (
        <>
          <Button
            label={t('editProfile')}
            disabled={busy}
            secondary
            onPress={() => {
              setSaved(false);
              setEditing(true);
            }}
          />
          {editing ? (
            <ProfileEditor
              profile={profile.data}
              controller={session.controller}
              queryKey={profileQueryKey}
              onSaved={() => {
                setEditing(false);
                setSaved(true);
              }}
              onCancel={() => {
                setEditing(false);
                void profile.refetch();
              }}
            />
          ) : null}
        </>
      ) : null}
      {profile.data && !profile.isError && session.controller && context ? (
        <>
          <Button
            label={t('savedAddresses')}
            disabled={busy}
            secondary
            onPress={() => setAddressesOpen(true)}
          />
          {addressesOpen ? (
            <SavedAddressesModal
              key={session.ownerVersion}
              context={context}
              controller={session.controller}
              userId={profile.data.id}
              ownerVersion={session.ownerVersion}
              onClose={() => setAddressesOpen(false)}
            />
          ) : null}
          <Button
            label={t('deleteAccount')}
            disabled={busy}
            destructive
            onPress={() => setDeleting(true)}
          />
          {deleting ? (
            <AccountDeletionModal
              key={session.ownerVersion}
              profile={profile.data}
              controller={session.controller}
              restaurant={context.tenant.name}
              onClose={() => setDeleting(false)}
              logout={logout}
            />
          ) : null}
        </>
      ) : null}
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
