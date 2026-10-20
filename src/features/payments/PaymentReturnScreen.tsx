import { useEffect, useMemo } from 'react';
import { useURL } from 'expo-linking';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { runtimeConfig } from '../../config';
import { paymentReturnDestination } from '../../core/paymentReturnDestination';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import Screen from '../../ui/Screen';
import Feedback from '../../ui/Feedback';
import Button from '../../ui/Button';
export default function PaymentReturnScreen() {
  const url = useURL();
  const router = useRouter();
  const { t } = useTranslation();
  const { directory, context, select } = useRestaurant();
  const destination = useMemo(() => {
    if (!url || !directory || !runtimeConfig) return undefined;
    try {
      return paymentReturnDestination(url, runtimeConfig.linkOrigin, directory);
    } catch {
      return null;
    }
  }, [url, directory]);
  const anotherRestaurant = Boolean(
    destination && context && context.tenant.id !== destination.tenantId,
  );
  const navigate = () => {
    if (!destination) return;
    if (context?.tenant.id !== destination.tenantId && !select(destination.tenantId)) return;
    router.replace(destination.pathname);
  };
  useEffect(() => {
    if (!destination || anotherRestaurant) return;
    if (!context && !select(destination.tenantId)) return;
    router.replace(destination.pathname);
  }, [destination, anotherRestaurant, context, select, router]);
  const failed = destination === null;
  return (
    <Screen>
      <Feedback
        loading={!failed && !anotherRestaurant}
        message={t(
          failed
            ? 'invalidQr'
            : anotherRestaurant
              ? 'hostedPayment.returnOtherRestaurant'
              : 'loading',
        )}
      />
      {anotherRestaurant ? (
        <Button label={t('hostedPayment.returnRestaurant')} onPress={navigate} />
      ) : null}
      <Button label={t('orders')} onPress={() => router.replace('/orders')} />
    </Screen>
  );
}
