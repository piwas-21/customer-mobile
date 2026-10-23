import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import TableOperationStopModal from './TableOperationStopModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { useTablePlan } from './PlanProvider';
export default function PlanNotice() {
  const flow = useTablePlan();
  const { t } = useTranslation();
  const [stopping, setStopping] = useState<{
    controller: NonNullable<typeof flow>['controller'];
    id: string;
  }>();
  if (!flow?.controller) return null;
  const value = flow.value;
  const terminal = value && value.outcome !== 'pending';
  const busy = flow.busy || flow.loading;
  const current =
    !terminal && stopping?.controller === flow.controller && stopping.id === value?.operationId
      ? stopping
      : undefined;
  let message = 'tablePlanPending';
  if (value?.outcome === 'applied') message = 'tablePlanApplied';
  if (value?.outcome === 'stopped') message = 'tablePlanStopped';
  return (
    <>
      {flow.failed ? (
        <Feedback
          message={t('tablePlanFailed')}
          retry={() => void flow.check().catch(() => undefined)}
        />
      ) : null}
      {value ? (
        <>
          <Feedback message={t(message)} />
          {terminal ? (
            <Button
              label={t('tableRoundDone')}
              disabled={busy}
              onPress={() => void flow.acknowledge(value.operationId).catch(() => undefined)}
            />
          ) : (
            <>
              <Button
                label={t('tablePlanCheck')}
                disabled={busy}
                onPress={() => void flow.check().catch(() => undefined)}
              />
              <Button
                label={t('tablePlanStop')}
                secondary
                disabled={busy}
                onPress={() => setStopping({ controller: flow.controller, id: value.operationId })}
              />
            </>
          )}
        </>
      ) : null}
      {current ? (
        <TableOperationStopModal
          title={t('tablePlanStop')}
          hint={t('tablePlanStopHint')}
          confirmLabel={t('tablePlanStopConfirm')}
          busy={busy}
          onClose={() => setStopping(undefined)}
          onConfirm={() => {
            setStopping(undefined);
            void flow.stop(current.id).catch(() => undefined);
          }}
        />
      ) : null}
    </>
  );
}
