import { useTranslation } from 'react-i18next';
import type { useBasket } from './BasketProvider';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
type Pending = NonNullable<ReturnType<typeof useBasket>['pendingOrder']>;
function message(pending: Pending) {
  if (pending.cleanupPending) return 'orderCleanupPending';
  if (pending.cancelling) return 'orderCancellationPending';
  return 'orderOutcomePending';
}
export default function OrderRecoveryActions({
  pending,
  busy,
  recover,
  stop,
}: Readonly<{
  pending: Pending;
  busy: boolean;
  recover: () => void;
  stop: () => void;
}>) {
  const { t } = useTranslation();
  return (
    <>
      <Feedback message={t(message(pending))} />
      <Button
        label={t(pending.cleanupPending || pending.cancelling ? 'finishOrderCheck' : 'checkOrder')}
        busy={busy}
        onPress={recover}
      />
      {!pending.cancelling && !pending.cleanupPending ? (
        <Button label={t('stopOrderAttempt')} secondary disabled={busy} onPress={stop} />
      ) : null}
    </>
  );
}
