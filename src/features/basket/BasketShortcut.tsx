import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useBasket } from './BasketProvider';
import Button from '../../ui/Button';
export default function BasketShortcut() {
  const basket = useBasket();
  const { t } = useTranslation();
  const router = useRouter();
  if (basket.unavailable && !basket.hasPending) return null;
  return (
    <Button
      label={
        basket.basket?.totalItems
          ? t('basketCount', { count: basket.basket.totalItems })
          : t('openBasket')
      }
      onPress={() => router.push('/basket')}
    />
  );
}
