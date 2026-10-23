import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { requireTableContributionEnabled } from '../../core/tableContributionPolicy';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
import Button from '../../ui/Button';
import type useTableVisit from './useTableVisit';
import { useTableContribution } from './ContributionProvider';
import ContributionModal from './ContributionModal';
export default function ContributionControl({
  flow,
}: Readonly<{ flow: ReturnType<typeof useTableVisit> }>) {
  const contribution = useTableContribution();
  const { context } = useRestaurant();
  const { userId } = useSession();
  const bootstrap = useBootstrap().data;
  const { t } = useTranslation();
  const account = flow.account;
  const reader = flow.paymentAccount;
  const scope = useMemo(
    () => ({
      controller: contribution?.controller,
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
    [contribution?.controller, flow.scope, bootstrap, reader, account],
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
    /* Original recovery remains available while current rollout is withdrawn. */
  }
  if (
    !allowed ||
    !contribution?.controller ||
    !scope.view ||
    !account ||
    !flow.value ||
    flow.value.expired
  )
    return null;
  const ready =
    contribution.value === null &&
    !contribution.loading &&
    !contribution.failed &&
    !contribution.busy &&
    !flow.busy;
  return (
    <>
      <Button
        label={t('tableContributionTitle')}
        disabled={!ready}
        onPress={() => setOpened(scope)}
      />
      {opened === scope ? (
        <ContributionModal
          scope={scope.view}
          bill={account}
          onClose={() => {
            if (!contribution.busy) setOpened(undefined);
          }}
        />
      ) : null}
    </>
  );
}
