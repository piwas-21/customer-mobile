import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTablePaymentMinor } from '../../domain/tablePaymentMoney';
import TableOperationStopModal from './TableOperationStopModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { useTableContribution } from './ContributionProvider';
export default function ContributionNotice() {
  const flow = useTableContribution();
  const { t, i18n } = useTranslation();
  const [stopping, setStopping] = useState<{
    controller: NonNullable<typeof flow>['controller'];
    id: string;
  }>();
  if (!flow?.controller) return null;
  const value = flow.value;
  const terminal = value?.state === 'paid' || value?.state === 'stopped';
  const busy = flow.busy || flow.loading;
  const current =
    !terminal && stopping?.controller === flow.controller && stopping.id === value?.operationId
      ? stopping
      : undefined;
  let message = 'tableContributionPending';
  if (value?.state === 'paid') message = 'tableContributionPaid';
  if (value?.state === 'stopped') message = 'tableContributionStopped';
  return (
    <>
      {flow.failed ? (
        <Feedback
          message={t('tableContributionFailed')}
          retry={() => void flow.check().catch(() => undefined)}
        />
      ) : null}
      {value ? (
        <>
          <Feedback
            message={t(message, {
              amount: formatTablePaymentMinor(value.amountMinor, value.currency, i18n.language),
            })}
          />
          {terminal ? (
            <Button
              label={t('tableRoundDone')}
              disabled={busy}
              onPress={() => void flow.acknowledge(value.operationId).catch(() => undefined)}
            />
          ) : (
            <>
              <Button
                label={t('tableContributionCheck')}
                disabled={busy}
                onPress={() => void flow.check().catch(() => undefined)}
              />
              {value.canOpen ? (
                <Button
                  label={t('hostedPayment.open')}
                  disabled={busy}
                  onPress={() => void flow.open().catch(() => undefined)}
                />
              ) : null}
              <Button
                label={t('tableContributionStop')}
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
          title={t('tableContributionStop')}
          hint={t('tableContributionStopHint')}
          confirmLabel={t('tableContributionStopConfirm')}
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
