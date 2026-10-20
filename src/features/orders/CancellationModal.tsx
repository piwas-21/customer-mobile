import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CancellationView } from '../../core/cancellationView';
import type { CancellationOffer } from '../../core/customerCancellationController';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { useCancellation } from './CancellationProvider';
export default function CancellationModal({
  orderId,
  originalOperationId,
  onClose,
  onBack,
}: Readonly<{
  orderId: string;
  originalOperationId?: string;
  onClose: () => void;
  onBack: () => void;
}>) {
  const state = useCancellation();
  const controller = state?.controller;
  const { t, i18n } = useTranslation();
  const scope = useMemo(
    () => ({ controller, orderId, originalOperationId, locale: i18n.language }),
    [controller, orderId, originalOperationId, i18n.language],
  );
  const [offer, setOffer] = useState<{ scope: typeof scope; value: CancellationOffer }>();
  const [failed, setFailed] = useState<typeof scope>();
  const [submitted, setSubmitted] = useState<typeof scope>();
  useEffect(() => {
    if (!scope.controller) return;
    let active = true;
    const request = scope.originalOperationId
      ? scope.controller.offerOriginal(scope.orderId, scope.originalOperationId, scope.locale)
      : scope.controller.offer(scope.orderId, scope.locale);
    void request
      .then((value) => {
        scope.controller?.assertCurrent();
        if (active) setOffer({ scope, value });
      })
      .catch(() => {
        if (active) setFailed(scope);
      });
    return () => {
      active = false;
    };
  }, [scope]);
  if (!state || !controller) return null;
  const current = offer?.scope === scope ? offer.value : undefined;
  const sent = submitted === scope;
  const problem = failed === scope;
  const result = state.value?.orderId === orderId ? state.value : null;
  async function confirm() {
    if (!current?.allowed || !state || sent || state.busy || state.loading) return;
    setSubmitted(scope);
    try {
      await state.confirm(orderId);
    } catch {
      setFailed(scope);
    }
  }
  return (
    <BaseModal title={t('cancellation.title')} onClose={onClose}>
      <Feedback message={t('cancellation.explanation')} />
      {!current && !problem ? <Feedback message={t('loading')} loading /> : null}
      <ResultFeedback preparation={current} problem={problem} submitted={sent} result={result} />
      {current?.allowed && !sent && !problem ? (
        <Button
          destructive
          label={t('cancellation.confirm')}
          disabled={state.loading}
          busy={state.busy}
          onPress={() => {
            void confirm();
          }}
        />
      ) : null}
      <Button
        secondary
        label={t(sent ? 'close' : 'cancellation.keep')}
        onPress={sent ? onClose : onBack}
      />
    </BaseModal>
  );
}

function ResultFeedback({
  preparation,
  problem,
  submitted,
  result,
}: Readonly<{
  preparation: CancellationOffer | undefined;
  problem: boolean;
  submitted: boolean;
  result: CancellationView | null;
}>) {
  const { t } = useTranslation();
  return (
    <>
      {problem && result?.outcome !== 'Cancelled' && result?.outcome !== 'Refused' ? (
        <Feedback message={t(submitted ? 'cancellation.unknown' : 'cancellation.unavailable')} />
      ) : null}
      {preparation && !preparation.allowed ? (
        <Feedback message={t(`cancellation.reason.${preparation.reason}`)} />
      ) : null}
      {submitted && result ? (
        <Feedback message={t(`cancellation.outcome.${result.outcome}`)} />
      ) : null}
    </>
  );
}
