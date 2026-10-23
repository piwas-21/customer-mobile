import { useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TableAccount } from '../../api/tableAccountContract';
import type { TableContributionReviewView } from '../../core/tableContributionController';
import type { TableContributionChoice } from '../../domain/tableContributionSelection';
import { formatTablePaymentMinor } from '../../domain/tablePaymentMoney';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import useMounted from '../../core/useMounted';
import { useTableContribution } from './ContributionProvider';
import useTablePaymentRead, { type TablePaymentViewScope } from './useTablePaymentRead';
import ContributionChoices from './ContributionChoices';
export default function ContributionModal({
  scope,
  bill,
  onClose,
}: Readonly<{
  scope: TablePaymentViewScope;
  bill: TableAccount;
  onClose: () => void;
}>) {
  const flow = useTableContribution();
  const { t, i18n } = useTranslation();
  const result = useTablePaymentRead(scope);
  const mounted = useMounted();
  const [review, setReview] = useState<{
    controller: NonNullable<typeof flow>['controller'];
    value: TableContributionReviewView;
  }>();
  const controller = flow?.controller;
  useLayoutEffect(() => () => controller?.invalidateReview(), [controller, scope]);
  const current =
    review?.controller === controller && flow?.value === null && !flow.failed
      ? review?.value
      : undefined;
  const busy = Boolean(flow?.busy || flow?.loading);
  async function prepare(choice: TableContributionChoice) {
    if (!flow || !controller || busy) return;
    try {
      const value = await flow.prepare(choice);
      controller.assertCurrent();
      if (!mounted.current) {
        controller.dismiss(value.operationId);
        return;
      }
      setReview({ controller, value });
    } catch {
      /* Current attempt and failure remain visible through shared recovery. */
    }
  }
  const choices =
    result.data && flow?.value === null ? (
      <ContributionChoices
        snapshot={result.data}
        bill={bill}
        busy={busy}
        onReview={(choice) => void prepare(choice)}
      />
    ) : (
      <Feedback
        loading={result.loading}
        message={t(result.loading ? 'loading' : 'tablePaymentReadFailed')}
      />
    );
  return (
    <BaseModal
      title={t('tableContributionTitle')}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <Feedback message={t('tableContributionHint')} />
      {flow?.failed ? <Feedback message={t('tableContributionFailed')} /> : null}
      {current ? (
        <>
          <Feedback
            message={formatTablePaymentMinor(current.amountMinor, current.currency, i18n.language)}
          />
          <Button
            label={t('tableContributionConfirm')}
            busy={busy}
            onPress={() => {
              if (!flow || !controller) return;
              const id = current.operationId;
              void flow
                .confirm(id)
                .then(() => {
                  if (mounted.current) onClose();
                })
                .catch(() => undefined)
                .finally(() => {
                  if (mounted.current) setReview(undefined);
                });
            }}
          />
          <Button
            label={t('back')}
            secondary
            disabled={busy}
            onPress={() => {
              controller?.dismiss(current.operationId);
              setReview(undefined);
            }}
          />
        </>
      ) : (
        choices
      )}
      <Button label={t('close')} secondary disabled={busy} onPress={onClose} />
    </BaseModal>
  );
}
