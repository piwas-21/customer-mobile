import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useBasket } from '../basket/BasketProvider';
import useBootstrap from '../restaurant/useBootstrap';
import { canUse } from '../../core/capabilities';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
export default function ReorderEntry({
  onPress,
  disabled = false,
}: Readonly<{ onPress: () => void; disabled?: boolean }>) {
  const basket = useBasket();
  const bootstrap = useBootstrap();
  const { t } = useTranslation();
  if (!canUse(bootstrap.data, 'ordering')) return null;
  return (
    <View>
      <Button
        label={t('reorder.title')}
        onPress={() => {
          if (!disabled && basket.canAdd && !basket.busy) onPress();
        }}
        disabled={disabled || !basket.canAdd || basket.busy}
      />
      {!basket.canAdd ? <Feedback message={t('reorder.blocked')} /> : null}
    </View>
  );
}
