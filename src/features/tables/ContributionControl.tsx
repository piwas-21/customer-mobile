import { useTranslation } from 'react-i18next';
import type useTableVisit from './useTableVisit';
import { useTableContribution } from './ContributionProvider';
import ContributionModal from './ContributionModal';
import TablePaymentActionControl from './TablePaymentActionControl';
export default function ContributionControl({
  flow,
}: Readonly<{ flow: ReturnType<typeof useTableVisit> }>) {
  const action = useTableContribution();
  const { t } = useTranslation();
  return (
    <TablePaymentActionControl
      flow={flow}
      action={action}
      label={t('tableContributionTitle')}
      renderModal={(scope, onClose, bill) => (
        <ContributionModal scope={scope} onClose={onClose} bill={bill} />
      )}
    />
  );
}
