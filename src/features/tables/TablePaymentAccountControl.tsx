import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../../ui/Button';
import type useTableVisit from './useTableVisit';
import TablePaymentAccountModal from './TablePaymentAccountModal';

export default function TablePaymentAccountControl({
  flow,
}: Readonly<{ flow: ReturnType<typeof useTableVisit> }>) {
  const { t } = useTranslation();
  const reader = flow.paymentAccount;
  const account = flow.account;
  const scope = useMemo(
    () => ({
      owner: flow.scope,
      view:
        reader && account?.currency
          ? {
              read: reader,
              visit: account.serviceSessionId,
              revision: account.accountRevision,
              currency: account.currency,
            }
          : undefined,
    }),
    [reader, account, flow.scope],
  );
  const [opened, setOpened] = useState<typeof scope>();
  if (!scope.view || !flow.value || flow.value.expired || flow.busy) return null;
  return (
    <>
      <Button secondary label={t('tablePaymentDetails')} onPress={() => setOpened(scope)} />
      {opened === scope ? (
        <TablePaymentAccountModal
          scope={scope.view}
          onClose={() => setOpened(undefined)}
          onRefreshBill={() => {
            setOpened(undefined);
            flow.refresh();
          }}
        />
      ) : null}
    </>
  );
}
