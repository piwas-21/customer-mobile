import { ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import Screen from '../../ui/Screen';
import Feedback from '../../ui/Feedback';
import { spacing, typography, useTheme } from '../../ui/theme';
import useAccount from './useAccount';
import AccountContent from './AccountContent';
export default function AccountScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const account = useAccount();
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
        <AccountContent account={account} />
        {account.failure && account.failure !== 'logout' ? (
          <Feedback message={t(`accountFailure.${account.failure}`)} />
        ) : null}
      </ScrollView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: typography.title, fontWeight: '700' },
  body: { fontSize: typography.body, lineHeight: 26 },
});
