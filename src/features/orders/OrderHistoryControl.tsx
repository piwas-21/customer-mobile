import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import Button from '../../ui/Button';
import OrderHistoryModal from './OrderHistoryModal';
export default function OrderHistoryControl() {
  const { t } = useTranslation();
  const { context } = useRestaurant();
  const { controller, userId, ownerVersion, unavailable, needsCleanup } = useSession();
  const scope = useMemo(
    () => ({ context, controller, userId, ownerVersion, unavailable, needsCleanup }),
    [context, controller, userId, ownerVersion, unavailable, needsCleanup],
  );
  const [selected, setSelected] = useState<typeof scope>();
  if (!context || !controller || !userId || unavailable || needsCleanup) return null;
  return (
    <>
      <Button
        label={t('accountOrderHistory')}
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
        <OrderHistoryModal
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
