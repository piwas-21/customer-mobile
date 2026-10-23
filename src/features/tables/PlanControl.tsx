import { useTranslation } from 'react-i18next';
import type useTableVisit from './useTableVisit';
import { useTablePlan } from './PlanProvider';
import PlanModal from './PlanModal';
import TablePaymentActionControl from './TablePaymentActionControl';
export default function PlanControl({
  flow,
}: Readonly<{ flow: ReturnType<typeof useTableVisit> }>) {
  const action = useTablePlan();
  const { t } = useTranslation();
  return (
    <TablePaymentActionControl
      flow={flow}
      action={action}
      label={t('tablePlanTitle')}
      renderModal={(scope, onClose) => <PlanModal scope={scope} onClose={onClose} />}
    />
  );
}
