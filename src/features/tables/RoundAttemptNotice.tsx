import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { useTableRound } from './RoundProvider';
export default function RoundAttemptNotice() {
  const flow = useTableRound();
  const { t } = useTranslation();
  const [confirmation, setConfirmation] = useState<{
    controller: NonNullable<typeof flow>['controller'];
    id: string;
  }>();
  if (!flow?.controller) return null;
  const value = flow.value;
  const pending = value?.outcome === 'Pending';
  const busy = flow.busy || flow.loading;
  const current =
    pending && confirmation?.controller === flow.controller && confirmation.id === value.operationId
      ? confirmation
      : undefined;
  let message = 'tableRoundPending';
  if (value?.outcome === 'Applied') message = 'tableRoundAccepted';
  else if (value?.outcome === 'Cancelled') message = 'tableRoundStopped';
  return (
    <>
      {flow.failed ? (
        <Feedback
          message={t('tableRoundFailed')}
          retry={() => void flow.restore().catch(() => undefined)}
        />
      ) : null}
      {value ? (
        <>
          <Feedback message={t(message)} />
          {pending ? (
            <>
              <Button
                label={t('tableRoundCheck')}
                disabled={busy}
                onPress={() => void flow.check().catch(() => undefined)}
              />
              <Button
                label={t('tableRoundStop')}
                secondary
                disabled={busy}
                onPress={() =>
                  setConfirmation({ controller: flow.controller, id: value.operationId })
                }
              />
            </>
          ) : (
            <Button
              label={t('tableRoundDone')}
              disabled={busy}
              onPress={() => void flow.acknowledge(value.operationId).catch(() => undefined)}
            />
          )}
        </>
      ) : null}
      {current ? (
        <BaseModal title={t('tableRoundStop')} onClose={() => setConfirmation(undefined)}>
          <Feedback message={t('tableRoundStopHint')} />
          <Button
            label={t('tableRoundStopConfirm')}
            busy={flow.busy}
            onPress={() => {
              const id = current.id;
              setConfirmation(undefined);
              void flow.cancelAttempt(id).catch(() => undefined);
            }}
          />
          <Button label={t('back')} secondary onPress={() => setConfirmation(undefined)} />
        </BaseModal>
      ) : null}
    </>
  );
}
