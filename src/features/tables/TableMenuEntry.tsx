import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { canUse } from '../../core/capabilities';
import useBootstrap from '../restaurant/useBootstrap';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
export default function TableMenuEntry({ enabled }: Readonly<{ enabled: boolean }>) {
  const bootstrap = useBootstrap().data;
  const { t } = useTranslation();
  const router = useRouter();
  if (!enabled || !canUse(bootstrap, 'ordering')) return null;
  return (
    <>
      <Button label={t('tableChooseDishes')} onPress={() => router.push('/menu')} />
      <Feedback message={t('tableDineInHint')} />
    </>
  );
}
