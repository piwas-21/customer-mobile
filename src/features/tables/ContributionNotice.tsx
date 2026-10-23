import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTablePaymentMinor } from '../../domain/tablePaymentMoney';
import BaseModal from '../../ui/BaseModal';
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
            message={t(
              value.state === 'paid'
                ? 'tableContributionPaid'
                : value.state === 'stopped'
                  ? 'tableContributionStopped'
                  : 'tableContributionPending',
              { amount: formatTablePaymentMinor(value.amountMinor, value.currency, i18n.language) },
            )}
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
        <BaseModal title={t('tableContributionStop')} onClose={() => setStopping(undefined)}>
          <Feedback message={t('tableContributionStopHint')} />
          <Button
            label={t('tableContributionStopConfirm')}
            disabled={busy}
            onPress={() => {
              setStopping(undefined);
              void flow.stop(current.id).catch(() => undefined);
            }}
          />
          <Button label={t('back')} secondary onPress={() => setStopping(undefined)} />
        </BaseModal>
      ) : null}
    </>
  );
}
