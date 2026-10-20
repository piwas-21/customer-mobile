import { useEffect, useSyncExternalStore } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { pendingAccountActions, type PendingAccountAction } from '../../core/pendingAccountAction';
import { NATIVE_ACCOUNT_PASSWORD_MAX_LENGTH } from '../../domain/nativeAccountPolicy';
import Screen from '../../ui/Screen';
import Field from '../../ui/Field';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { spacing, typography, useTheme } from '../../ui/theme';
import useNativeAccountAction from './useNativeAccountAction';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
import { canUseNativeAccountLinks } from '../../core/capabilities';

function AccountAction({ entry }: Readonly<{ entry: PendingAccountAction }>) {
  const form = useNativeAccountAction(entry);
  const { t } = useTranslation();
  const theme = useTheme();
  if (form.status === 'done') return <Feedback message={t(`nativeAccount.${entry.action}Done`)} />;
  if (form.status === 'unknown') return <Feedback message={t('nativeAccount.unknown')} />;
  if (!form.tenant)
    return (
      <Feedback
        loading={form.loading}
        message={t(form.loading ? 'loading' : 'nativeAccount.unavailable')}
      />
    );
  if (!form.selected)
    return (
      <>
        <Feedback message={t('nativeAccount.choose', { name: form.tenant.name })} />
        <Button
          label={t('nativeAccount.continueAt', { name: form.tenant.name })}
          onPress={form.choose}
        />
      </>
    );
  if (!form.available)
    return (
      <Feedback
        loading={form.loading}
        message={t(form.loading ? 'loading' : 'nativeAccount.unavailable')}
      />
    );
  return (
    <>
      <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>
        {t(`nativeAccount.${entry.action}Title`, { name: form.tenant.name })}
      </Text>
      <Feedback message={t('nativeAccount.explicit')} />
      {entry.action === 'recover' ? (
        <>
          <Text style={{ color: theme.secondary }}>{t('passwordPolicy')}</Text>
          <Field
            label={t('nativeAccount.newPassword')}
            value={form.newPassword}
            onChangeText={form.setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            maxLength={NATIVE_ACCOUNT_PASSWORD_MAX_LENGTH}
            editable={form.status !== 'busy'}
          />
          <Field
            label={t('confirmPassword')}
            value={form.confirmPassword}
            onChangeText={form.setConfirmPassword}
            secureTextEntry
            autoComplete="new-password"
            maxLength={NATIVE_ACCOUNT_PASSWORD_MAX_LENGTH}
            editable={form.status !== 'busy'}
          />
        </>
      ) : null}
      {form.inputFailed ? <Feedback message={t('accountRequestFailure.input')} /> : null}
      <Button
        label={t(`nativeAccount.${entry.action}Action`)}
        busy={form.status === 'busy'}
        onPress={() => {
          void form.submit();
        }}
      />
    </>
  );
}
export default function NativeAccountActionScreen() {
  const entry = useSyncExternalStore(
    pendingAccountActions.subscribe,
    pendingAccountActions.snapshot,
  );
  const { t } = useTranslation();
  const router = useRouter();
  const { context } = useRestaurant();
  const bootstrap = useBootstrap();
  useEffect(() => (entry ? pendingAccountActions.retain(entry.id) : undefined), [entry]);
  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        {entry ? (
          <AccountAction
            key={`${entry.id}:${context?.environment}:${context?.tenant.id}:${context?.generation}:${canUseNativeAccountLinks(bootstrap.data)}`}
            entry={entry}
          />
        ) : (
          <Feedback message={t('nativeAccount.invalid')} />
        )}
        <Button
          label={t('account')}
          secondary
          onPress={() => {
            pendingAccountActions.clear();
            router.replace('/account');
          }}
        />
      </ScrollView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: spacing.xl },
  heading: { fontSize: typography.heading, fontWeight: '600' },
});
