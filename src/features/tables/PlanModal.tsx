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
      renderReview={(current) => (
        <>
          <Feedback
            message={t('tablePlanTotal', {
              amount: formatTablePaymentMinor(current.totalMinor, current.currency, i18n.language),
            })}
          />
          {current.sharesMinor.map((amount, i) => (
            <Feedback
              key={i}
              message={t('tablePlanShare', {
                position: new Intl.NumberFormat(i18n.language).format(i + 1),
                amount: formatTablePaymentMinor(amount, current.currency, i18n.language),
              })}
            />
          ))}
        </>
      )}
      renderChoices={(snapshot, busy, onReview) => (
        <PlanChoices snapshot={snapshot} busy={busy} onReview={onReview} />
      )}
    />
  );
}
