import { useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { openBrowserAsync } from 'expo-web-browser';
import {
  registrationSchema,
  recoverySchema,
  requestRegistration,
  requestRecovery,
  requestVerification,
  type RegistrationInput,
  type RecoveryInput,
} from '../../api/accountRequests';
import { NATIVE_ACCOUNT_PASSWORD_MAX_LENGTH } from '../../domain/nativeAccountPolicy';
import { canUseNativeAccountLinks } from '../../core/capabilities';
import useBootstrap from '../restaurant/useBootstrap';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import Field from '../../ui/Field';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { spacing, typography, useTheme } from '../../ui/theme';
import useAccountRequest from './useAccountRequest';
export type AccountRequestMode = 'register' | 'recovery' | 'verification';
type Props = Readonly<{ mode: AccountRequestMode; onBack: () => void }>;
const requestCopy = {
  register: { title: 'createAccount', action: 'createAccount', sent: 'registrationSent' },
  recovery: { title: 'forgotPassword', action: 'sendRecovery', sent: 'recoverySent' },
  verification: {
    title: 'nativeAccount.requestVerification',
    action: 'nativeAccount.sendVerification',
    sent: 'nativeAccount.verificationSent',
  },
} as const;
export default function AccountRequestForm({ mode, onBack }: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { client, context } = useRestaurant();
  const bootstrap = useBootstrap();
  const { title, action, sent } = requestCopy[mode];
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [legalFailed, setLegalFailed] = useState(false);
  // Both journeys use the same bounded state machine; each request validates its own input.
  const form = useAccountRequest<RegistrationInput | RecoveryInput>(
    mode === 'register' ? registrationSchema : recoverySchema,
    async (input, assertCurrent) => {
      if (!client || !context) throw new Error('Select a restaurant');
      if (mode === 'register')
        await requestRegistration(
          client,
          context,
          registrationSchema.parse(input),
          i18n.language,
          assertCurrent,
        );
      else if (mode === 'verification')
        await requestVerification(client, context, input, i18n.language, assertCurrent);
      else await requestRecovery(client, context, input, i18n.language, assertCurrent);
    },
    () => {
      setPassword('');
      setConfirmPassword('');
    },
  );
  async function submit() {
    Keyboard.dismiss();
    const input =
      mode === 'register' ? { email, firstName, lastName, password, confirmPassword } : { email };
    await form.submit(input);
  }
  async function openLegal(path: '/privacy-policy' | '/terms-of-usage') {
    if (!context) return;
    try {
      await openBrowserAsync(new URL(path, context.tenant.webOrigin).toString());
    } catch {
      setLegalFailed(true);
    }
  }
  if (!canUseNativeAccountLinks(bootstrap.data))
    return (
      <View style={styles.form}>
        <Feedback
          message={t(bootstrap.isPending ? 'loading' : 'nativeAccount.unavailable')}
          loading={bootstrap.isPending}
        />
        <Button label={t('backToSignIn')} secondary onPress={onBack} />
      </View>
    );
  if (form.sent)
    return (
      <View style={styles.form}>
        <Feedback message={t(sent)} />
        <Button label={t('backToSignIn')} onPress={onBack} />
      </View>
    );
  return (
    <View style={styles.form}>
      <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>
        {t(title)}
      </Text>
      {mode === 'register' ? (
        <>
          <Field
            label={t('firstName')}
            value={firstName}
            onChangeText={setFirstName}
            textContentType="givenName"
            autoComplete="given-name"
            maxLength={50}
            editable={!form.busy}
          />
          <Field
            label={t('lastName')}
            value={lastName}
            onChangeText={setLastName}
            textContentType="familyName"
            autoComplete="family-name"
            maxLength={50}
            editable={!form.busy}
          />
        </>
      ) : null}
      <Field
        label={t('email')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        maxLength={254}
        editable={!form.busy}
      />
      {mode === 'register' ? (
        <>
          <Text style={[styles.body, { color: theme.secondary }]}>{t('passwordPolicy')}</Text>
          <Field
            label={t('password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            maxLength={NATIVE_ACCOUNT_PASSWORD_MAX_LENGTH}
            editable={!form.busy}
          />
          <Field
            label={t('confirmPassword')}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoComplete="new-password"
            maxLength={NATIVE_ACCOUNT_PASSWORD_MAX_LENGTH}
            editable={!form.busy}
          />
          <Button
            label={t('privacyPolicy')}
            secondary
            onPress={() => {
              void openLegal('/privacy-policy');
            }}
          />
          <Button
            label={t('termsOfUse')}
            secondary
            onPress={() => {
              void openLegal('/terms-of-usage');
            }}
          />
        </>
      ) : null}
      {form.failure ? <Feedback message={t(`accountRequestFailure.${form.failure}`)} /> : null}
      {legalFailed ? <Feedback message={t('legalUnavailable')} /> : null}
      <Button
        label={t(action)}
        onPress={() => {
          void submit();
        }}
        busy={form.busy}
      />
      <Button label={t('backToSignIn')} secondary onPress={onBack} disabled={form.busy} />
    </View>
  );
}
const styles = StyleSheet.create({
  form: { gap: spacing.md },
  heading: { fontSize: typography.heading, fontWeight: '600' },
  body: { fontSize: typography.body, lineHeight: 26 },
});
