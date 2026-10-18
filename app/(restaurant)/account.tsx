import { useTranslation } from 'react-i18next';
import Screen from '../../src/ui/Screen';
import Feedback from '../../src/ui/Feedback';
export default function AccountRoute() {
  const { t } = useTranslation();
  return (
    <Screen>
      <Feedback message={t('accountIntro')} />
      <Feedback message={t('accountUnavailable')} />
    </Screen>
  );
}
