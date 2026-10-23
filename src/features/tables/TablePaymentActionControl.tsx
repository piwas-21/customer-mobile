import { useMemo, useState, type ReactNode } from 'react';
import { requireTableContributionEnabled } from '../../core/tableContributionPolicy';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
import type { TableAccount } from '../../api/tableAccountContract';
import type { TablePaymentViewScope } from './useTablePaymentRead';
import type useTableVisit from './useTableVisit';
import Button from '../../ui/Button';
type Action = {
  controller: object | undefined;
  value: unknown;
  loading: boolean;
  busy: boolean;
  failed: boolean;
};
export default function TablePaymentActionControl({
  flow,
  action,
  label,
  renderModal,
}: Readonly<{
  flow: ReturnType<typeof useTableVisit>;
  action: Action | undefined;
  label: string;
  renderModal: (scope: TablePaymentViewScope, close: () => void, bill: TableAccount) => ReactNode;
}>) {
  const { context } = useRestaurant();
  const { userId } = useSession();
  const bootstrap = useBootstrap().data;
  const account = flow.account;
  const reader = flow.paymentAccount;
  const scope = useMemo(
    () => ({
      controller: action?.controller,
      owner: flow.scope,
      bootstrap,
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
    [action?.controller, flow.scope, bootstrap, reader, account],
  );
  const [opened, setOpened] = useState<typeof scope>();
  let allowed = false;
  try {
    if (context && bootstrap) {
      requireTableContributionEnabled(
        context,
        bootstrap,
        userId ? { kind: 'customer', id: userId } : { kind: 'guest', id: 'basket' },
      );
      allowed = true;
    }
  } catch {
    /* Original recovery has its separate authority. */
  }
  if (
    !allowed ||
    !action?.controller ||
    !scope.view ||
    !account ||
    !flow.value ||
    flow.value.expired
  )
    return null;
  const ready =
    action.value === null && !action.loading && !action.failed && !action.busy && !flow.busy;
  const close = () => {
    if (!action.busy) setOpened(undefined);
  };
  return (
    <>
      <Button label={label} disabled={!ready} onPress={() => setOpened(scope)} />
      {opened === scope ? renderModal(scope.view, close, account) : null}
    </>
  );
}
