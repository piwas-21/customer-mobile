import { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Screen from '../../ui/Screen';
import Button from '../../ui/Button';
import BaseModal from '../../ui/BaseModal';
import Feedback from '../../ui/Feedback';
import { typography, useTheme } from '../../ui/theme';
import useTableVisit from './useTableVisit';
import TableVisitContent from './TableVisitContent';
export default function TableScreen() {
  const flow = useTableVisit();
  const { t } = useTranslation();
  const theme = useTheme();
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
      <TableVisitContent flow={flow} onLeave={(id) => setLeaving({ scope: flow.scope, id })} />
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
