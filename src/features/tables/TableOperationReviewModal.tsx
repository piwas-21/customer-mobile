import { useLayoutEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TablePaymentAccount } from '../../api/tablePaymentAccountContract';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import useMounted from '../../core/useMounted';
import useTablePaymentRead, { type TablePaymentViewScope } from './useTablePaymentRead';
type Owner = {
  invalidateReview: () => void;
  assertCurrent: () => void;
  dismiss: (id: string) => void;
};
type Flow<Choice, Review> = {
  controller: Owner | undefined;
  value: unknown;
  busy: boolean;
  loading: boolean;
  failed: boolean;
  prepare: (choice: Choice) => Promise<Review>;
  confirm: (id: string) => Promise<unknown>;
};
export default function TableOperationReviewModal<Choice, Review extends { operationId: string }>({
  flow,
  scope,
  title,
  hint,
  error,
  confirmLabel,
  onClose,
  renderReview,
  renderChoices,
}: Readonly<{
  flow: Flow<Choice, Review> | undefined;
  scope: TablePaymentViewScope;
  title: string;
  hint: string;
  error: string;
  confirmLabel: string;
  onClose: () => void;
  renderReview: (review: Review) => ReactNode;
  renderChoices: (
    snapshot: TablePaymentAccount,
    busy: boolean,
    review: (choice: Choice) => void,
  ) => ReactNode;
}>) {
  const { t } = useTranslation();
  const result = useTablePaymentRead(scope);
  const mounted = useMounted();
  const [review, setReview] = useState<{ controller: Owner; value: Review }>();
  const controller = flow?.controller;
  useLayoutEffect(() => () => controller?.invalidateReview(), [controller, scope]);
  const current =
    review?.controller === controller && flow?.value === null && !flow.failed
      ? review?.value
      : undefined;
  const busy = Boolean(flow?.busy || flow?.loading);
  async function prepare(choice: Choice) {
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
      /* The shared original attempt and failure stay visible. */
    }
  }
  const choices =
    result.data && flow?.value === null ? (
      renderChoices(result.data, busy, (choice) => void prepare(choice))
    ) : (
      <Feedback
        loading={result.loading}
        message={t(result.loading ? 'loading' : 'tablePaymentReadFailed')}
      />
    );
  return (
    <BaseModal
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <Feedback message={hint} />
      {flow?.failed ? <Feedback message={error} /> : null}
      {current ? (
        <>
          {renderReview(current)}
          <Button
            label={confirmLabel}
            busy={busy}
            onPress={() => {
              if (!flow || !controller) return;
              void flow
                .confirm(current.operationId)
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
