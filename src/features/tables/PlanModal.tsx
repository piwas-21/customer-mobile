import { useTranslation } from 'react-i18next';
import { formatTablePaymentMinor } from '../../domain/tablePaymentMoney';
import Feedback from '../../ui/Feedback';
import { useTablePlan } from './PlanProvider';
import type { TablePaymentViewScope } from './useTablePaymentRead';
import PlanChoices from './PlanChoices';
import TableOperationReviewModal from './TableOperationReviewModal';
export default function PlanModal({
  scope,
  onClose,
}: Readonly<{ scope: TablePaymentViewScope; onClose: () => void }>) {
  const flow = useTablePlan();
  const { t, i18n } = useTranslation();
  return (
    <TableOperationReviewModal
      flow={flow}
      scope={scope}
      onClose={onClose}
      title={t('tablePlanTitle')}
      hint={t('tablePlanHint')}
      error={t('tablePlanFailed')}
      confirmLabel={t('tablePlanConfirm')}
      renderReview={(current) => {
        // Guest ordinals are fixed within the original operation, including duplicate amounts.
        const shares = current.sharesMinor.map((amountMinor, index) => ({
          id: `${current.operationId}:${index}`,
          position: index + 1,
          amountMinor,
        }));
        return (
          <>
            <Feedback
              message={t('tablePlanTotal', {
                amount: formatTablePaymentMinor(
                  current.totalMinor,
                  current.currency,
                  i18n.language,
                ),
              })}
            />
            {shares.map((share) => (
              <Feedback
                key={share.id}
                message={t('tablePlanShare', {
                  position: new Intl.NumberFormat(i18n.language).format(share.position),
                  amount: formatTablePaymentMinor(
                    share.amountMinor,
                    current.currency,
                    i18n.language,
                  ),
                })}
              />
            ))}
          </>
        );
      }}
      renderChoices={(snapshot, busy, onReview) => (
        <PlanChoices snapshot={snapshot} busy={busy} onReview={onReview} />
      )}
    />
  );
}
