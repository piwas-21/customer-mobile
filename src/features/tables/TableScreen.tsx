import { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Screen from '../../ui/Screen';
import Button from '../../ui/Button';
import BaseModal from '../../ui/BaseModal';
import Feedback from '../../ui/Feedback';
import { typography, useTheme } from '../../ui/theme';
import useTableVisit from './useTableVisit';
import TableBill from './TableBill';
export default function TableScreen() {
  const flow = useTableVisit();
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const [leaving, setLeaving] = useState<{ scope: typeof flow.scope; id: string }>();
  const currentLeave =
    leaving?.scope === flow.scope && flow.value?.serviceSessionId === leaving?.id
      ? leaving
      : undefined;
  const body = [styles.body, { color: theme.secondary }];
  if (!flow.allowed)
    return (
      <Screen>
        <Feedback message={t('tableUnavailable')} />
      </Screen>
    );
  return (
    <Screen bottom top={false}>
      <Stack.Screen options={{ title: t('tableTitle') }} />
      {flow.loading ? <Feedback loading message={t('loading')} /> : null}
      {flow.busy ? <Feedback loading message={t('tableJoining')} /> : null}
      {flow.failed ? <Feedback message={t('tableAccessFailed')} retry={flow.refresh} /> : null}
      {flow.value ? (
        <>
          {flow.value.expired ? (
            <Feedback message={t('tableExpired')} />
          ) : (
            <>
              {flow.account ? (
                <TableBill account={flow.account} />
              ) : (
                <Feedback
                  loading={flow.accountLoading}
                  message={t(flow.accountLoading ? 'loading' : 'tableAccountFailed')}
                />
              )}
            </>
          )}
          <Button label={t('tableRefresh')} secondary onPress={flow.refresh} disabled={flow.busy} />
          <Button
            label={t('tableLeave')}
            secondary
            disabled={flow.busy}
            onPress={() => {
              if (flow.value) setLeaving({ scope: flow.scope, id: flow.value.serviceSessionId });
            }}
          />
        </>
      ) : flow.value === null && !flow.loading ? (
        <>
          <Text style={body}>{t('tableEmpty')}</Text>
          <Button
            label={t('tableScan')}
            disabled={flow.busy}
            onPress={() => router.push('/scan')}
          />
        </>
      ) : null}
      {flow.review ? (
        <BaseModal title={t('tableJoinTitle')} onClose={flow.dismissReview}>
          <Text style={body}>{t('tableJoinHint')}</Text>
          <Button label={t('tableJoinConfirm')} onPress={flow.confirmReview} disabled={flow.busy} />
          <Button label={t('close')} secondary onPress={flow.dismissReview} />
        </BaseModal>
      ) : null}
      {currentLeave ? (
        <BaseModal title={t('tableLeaveTitle')} onClose={() => setLeaving(undefined)}>
          <Text style={body}>{t('tableLeaveHint')}</Text>
          <Button
            label={t('tableLeaveConfirm')}
            disabled={flow.busy}
            onPress={() => {
              const id = currentLeave.id;
              setLeaving(undefined);
              void flow.leave(id);
            }}
          />
          <Button label={t('tableKeepAccess')} secondary onPress={() => setLeaving(undefined)} />
        </BaseModal>
      ) : null}
    </Screen>
  );
}
const styles = StyleSheet.create({ body: { fontSize: typography.body } });
