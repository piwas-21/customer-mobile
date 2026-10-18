import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Field from '../../ui/Field';
import Button from '../../ui/Button';
import { spacing } from '../../ui/theme';
import type { AccountState } from './useAccount';
export default function SignInForm({ account }: Readonly<{ account: AccountState }>) {
  const { t } = useTranslation();
  return (
    <View style={styles.form}>
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
  );
}
const styles = StyleSheet.create({ form: { gap: spacing.md } });
