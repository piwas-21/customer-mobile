import { useTranslation } from 'react-i18next';
import type { CancellationView } from '../../core/customerCancellationController';
import { useCancellation } from './CancellationProvider';
import { useSession } from '../account/SessionProvider';
import useBootstrap from '../restaurant/useBootstrap';
import { canUse } from '../../core/capabilities';
import Button from '../../ui/Button';
type Props = Readonly<{
  onPress: () => void;
  status: string;
  confirmationFlow: string;
  disabled?: boolean;
}>;
export default function CancellationEntry(props: Props) {
  const state = useCancellation();
  return state?.controller ? (
    <EnabledEntry
      {...props}
      value={state.value}
      busy={state.busy}
      loading={state.loading}
      failed={state.failed}
    />
  ) : null;
}
function EnabledEntry({
  onPress,
  status,
  confirmationFlow,
  disabled = false,
  value,
  busy,
  loading,
  failed,
}: Props & {
  value: CancellationView | null | undefined;
  busy: boolean;
  loading: boolean;
  failed: boolean;
}) {
  const session = useSession();
  const bootstrap = useBootstrap();
  const { t } = useTranslation();
  if (
    session.controller?.onlyRecoverOrders ||
    !canUse(bootstrap.data, 'ordering') ||
    status !== 'PendingApproval' ||
    confirmationFlow !== 'direct'
  )
    return null;
  const pending = value?.outcome === 'Pending' || value?.outcome === 'Unseen';
  return (
    <Button
      secondary
      destructive
      label={t('cancellation.title')}
      disabled={disabled || pending || busy || loading || failed}
      onPress={onPress}
    />
  );
}
