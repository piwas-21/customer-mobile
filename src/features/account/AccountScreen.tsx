import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Screen from '../../ui/Screen';
import Field from '../../ui/Field';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { spacing, typography, useTheme } from '../../ui/theme';
import useAccount from './useAccount';
export default function AccountScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const account = useAccount();
  const { session, profile } = account;
  return (
    <Screen>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
      >
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
          {t('account')}
        </Text>
        <Text style={[styles.body, { color: theme.secondary }]}>{t('accountIntro')}</Text>
        {session.loading ? (
          <Feedback message={t('loading')} loading />
        ) : session.failed ? (
          <Feedback message={t('sessionUnavailable')} retry={session.retry} />
        ) : session.unavailable ? (
          <Feedback message={t('accountUnavailable')} />
        ) : account.failure === 'logout' || session.needsCleanup ? (
          <Feedback
            message={t(account.busy ? 'signingOut' : 'accountFailure.logout')}
            loading={account.busy}
            retry={
              account.busy
                ? undefined
                : () => {
                    void account.logout();
                  }
            }
          />
        ) : session.userId ? (
          <View style={styles.section}>
            {profile.isPending ? (
              <Feedback message={t('loading')} loading />
            ) : profile.isError || !profile.data ? (
              <Feedback
                message={t('profileUnavailable')}
                retry={() => {
                  void profile.refetch();
                }}
              />
            ) : (
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
                {!profile.data.isEmailConfirmed ? (
                  <Feedback message={t('verificationRequired')} />
                ) : null}
              </View>
            )}
            <Button
              label={t('signOut')}
              onPress={() => {
                void account.logout();
              }}
              busy={account.busy}
              secondary
            />
          </View>
        ) : (
          <View style={styles.section}>
            <Field
              label={t('email')}
              value={account.email}
              onChangeText={account.setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="username"
              editable={!account.busy}
              maxLength={254}
            />
            <Field
              label={t('password')}
              value={account.password}
              onChangeText={account.setPassword}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              editable={!account.busy}
              maxLength={1024}
              returnKeyType="go"
              onSubmitEditing={() => {
                void account.login();
              }}
            />
            <Button
              label={t('signIn')}
              onPress={() => {
                void account.login();
              }}
              busy={account.busy}
            />
          </View>
        )}
        {account.failure && account.failure !== 'logout' ? (
          <Feedback message={t(`accountFailure.${account.failure}`)} />
        ) : null}
      </ScrollView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: spacing.xl },
  section: { gap: spacing.md },
  title: { fontSize: typography.title, fontWeight: '700' },
  heading: { fontSize: typography.heading, fontWeight: '600' },
  body: { fontSize: typography.body, lineHeight: 26 },
});
