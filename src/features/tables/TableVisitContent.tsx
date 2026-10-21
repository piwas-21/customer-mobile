import { Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { typography, useTheme } from '../../ui/theme';
import type useTableVisit from './useTableVisit';
import TableBill from './TableBill';

type Flow = ReturnType<typeof useTableVisit>;
export default function TableVisitContent({
  flow,
  onLeave,
}: Readonly<{ flow: Flow; onLeave: (id: string) => void }>) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  if (!flow.value) {
    if (flow.value !== null || flow.loading) return null;
    return (
      <>
        <Text style={[styles.body, { color: theme.secondary }]}>{t('tableEmpty')}</Text>
        <Button label={t('tableScan')} disabled={flow.busy} onPress={() => router.push('/scan')} />
      </>
    );
  }
  return (
    <>
      <AccountContent flow={flow} />
      <Button label={t('tableRefresh')} secondary onPress={flow.refresh} disabled={flow.busy} />
      <Button
        label={t('tableLeave')}
        secondary
        disabled={flow.busy}
        onPress={() => {
          if (flow.value) onLeave(flow.value.serviceSessionId);
        }}
      />
    </>
  );
}
function AccountContent({ flow }: Readonly<{ flow: Flow }>) {
  const { t } = useTranslation();
  if (flow.value?.expired) return <Feedback message={t('tableExpired')} />;
  if (flow.account) return <TableBill account={flow.account} />;
  return (
    <Feedback
      loading={flow.accountLoading}
      message={t(flow.accountLoading ? 'loading' : 'tableAccountFailed')}
    />
  );
}
const styles = StyleSheet.create({ body: { fontSize: typography.body } });
