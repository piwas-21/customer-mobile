import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { canUse } from '../../core/capabilities';
import Button from '../../ui/Button';
import { useSession } from './SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
import type { SessionController } from '../../core/sessionController';
import type { TenantContext } from '../../core/tenantContext';

export type CustomerModuleModalProps = Readonly<{
  context: TenantContext;
  controller: SessionController;
  userId: string;
  ownerVersion: string;
  zone: string;
  onClose: () => void;
}>;

export default function CustomerModuleControl({
  capability,
  label,
  renderModal,
}: Readonly<{
  capability: string;
  label: string;
  renderModal: (props: CustomerModuleModalProps) => ReactNode;
}>) {
  const { t } = useTranslation();
  const { context } = useRestaurant();
  const { controller, userId, ownerVersion, unavailable, needsCleanup } = useSession();
  const bootstrap = useBootstrap().data;
  const allowed = canUse(bootstrap, capability);
  const zone = bootstrap?.timezone;
  const currency = bootstrap?.currency;
  const scope = useMemo(
    () => ({
      context,
      controller,
      userId,
      ownerVersion,
      unavailable,
      needsCleanup,
      allowed,
      zone,
      currency,
      capability,
    }),
    [
      context,
      controller,
      userId,
      ownerVersion,
      unavailable,
      needsCleanup,
      allowed,
      zone,
      currency,
      capability,
    ],
  );
  const [selected, setSelected] = useState<typeof scope>();
  if (
    !allowed ||
    !context ||
    !controller ||
    !userId ||
    !zone ||
    !currency ||
    unavailable ||
    needsCleanup
  )
    return null;
  return (
    <>
      <Button
        label={t(label)}
        secondary
        onPress={() => {
          try {
            controller.captureRequestOwner({ kind: 'customer', id: userId });
            setSelected(scope);
          } catch {
            setSelected(undefined);
          }
        }}
      />
      {selected === scope
        ? renderModal({
            context,
            controller,
            userId,
            ownerVersion,
            zone,
            onClose: () => setSelected(undefined),
          })
        : null}
    </>
  );
}
