import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { canUse } from '../../core/capabilities';
import Button from '../../ui/Button';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
import ReservationHistoryModal from './ReservationHistoryModal';

export default function ReservationHistoryControl() {
  const { t } = useTranslation();
  const { context } = useRestaurant();
  const { controller, userId, ownerVersion, unavailable, needsCleanup } = useSession();
  const bootstrap = useBootstrap().data;
  const allowed = canUse(bootstrap, 'reservations');
  const zone = bootstrap?.timezone;
  const scope = useMemo(
    () => ({ context, controller, userId, ownerVersion, unavailable, needsCleanup, allowed, zone }),
    [context, controller, userId, ownerVersion, unavailable, needsCleanup, allowed, zone],
  );
  const [selected, setSelected] = useState<typeof scope>();
  if (!allowed || !context || !controller || !userId || unavailable || needsCleanup) return null;
  return (
    <>
      <Button
        label={t('reservationHistory')}
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
      {selected === scope ? (
        <ReservationHistoryModal
          context={context}
          controller={controller}
          userId={userId}
          ownerVersion={ownerVersion}
          onClose={() => setSelected(undefined)}
        />
      ) : null}
    </>
  );
}
