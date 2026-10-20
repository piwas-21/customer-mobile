import { useTranslation } from 'react-i18next';
import { checkoutInputLimits } from '../../api/checkoutIntent';
import Field from '../../ui/Field';
import Feedback from '../../ui/Feedback';
import Button from '../../ui/Button';
import type useCheckoutFlow from './useCheckoutFlow';
export default function CheckoutPointsField({
  flow,
}: Readonly<{ flow: ReturnType<typeof useCheckoutFlow> }>) {
  const { t } = useTranslation();
  if (!flow.canRedeemPoints)
    return flow.draft.pointsToRedeem ? (
      <>
        <Feedback message={t('checkoutPointsUnavailable')} />
        <Button
          label={t('checkoutRemovePoints')}
          secondary
          disabled={flow.busy}
          onPress={() => flow.change('pointsToRedeem', '')}
        />
      </>
    ) : null;
  return (
    <>
      <Field
        label={t('checkoutPoints')}
        value={flow.draft.pointsToRedeem}
        keyboardType="number-pad"
        maxLength={checkoutInputLimits.pointsToRedeem}
        editable={!flow.busy}
        onChangeText={(value) => flow.change('pointsToRedeem', value)}
        {...(flow.invalid('pointsToRedeem') ? { error: t('checkoutPointsInvalid') } : {})}
      />
      <Feedback message={t('checkoutPointsHint')} />
    </>
  );
}
