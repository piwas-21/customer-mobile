import { useTranslation } from 'react-i18next';
import type { TableAccount } from '../../api/tableAccountContract';
import { formatTablePaymentMinor } from '../../domain/tablePaymentMoney';
import Feedback from '../../ui/Feedback';
import { useTableContribution } from './ContributionProvider';
import type { TablePaymentViewScope } from './useTablePaymentRead';
import ContributionChoices from './ContributionChoices';
import TableOperationReviewModal from './TableOperationReviewModal';
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
  return (
    <TableOperationReviewModal
      flow={flow}
      scope={scope}
      onClose={onClose}
      title={t('tableContributionTitle')}
      hint={t('tableContributionHint')}
      error={t('tableContributionFailed')}
      confirmLabel={t('tableContributionConfirm')}
      renderReview={(current) => (
        <Feedback
          message={formatTablePaymentMinor(current.amountMinor, current.currency, i18n.language)}
        />
      )}
      renderChoices={(snapshot, busy, onReview) => (
        <ContributionChoices snapshot={snapshot} bill={bill} busy={busy} onReview={onReview} />
      )}
    />
  );
}
