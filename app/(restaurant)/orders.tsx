import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Screen from '../../src/ui/Screen';
import Feedback from '../../src/ui/Feedback';
import Button from '../../src/ui/Button';
export default function OrdersRoute() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Screen>
      <Feedback message={t('noOrders')} />
      <Button label={t('backToMenu')} onPress={() => router.replace('/menu')} />
    </Screen>
  );
}
