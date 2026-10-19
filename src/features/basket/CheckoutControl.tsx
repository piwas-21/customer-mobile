import { useTranslation } from 'react-i18next';
import type { useBasket } from './BasketProvider';
import useCheckoutFlow from './useCheckoutFlow';
import CheckoutFields from './CheckoutFields';
import CheckoutSummary from './CheckoutSummary';
import Button from '../../ui/Button';
import BaseModal from '../../ui/BaseModal';
export default function CheckoutControl({
  basket,
  currency,
}: Readonly<{ basket: ReturnType<typeof useBasket>; currency?: string | undefined }>) {
  const { t } = useTranslation();
  const flow = useCheckoutFlow(basket);
  return (
    <>
      {flow.allowed ? <Button label={t('checkout')} onPress={flow.show} /> : null}
      {flow.open ? (
        <BaseModal title={t('checkout')} onClose={flow.close}>
          {flow.review.open ? (
            <CheckoutSummary flow={flow} />
          ) : (
            <CheckoutFields flow={flow} currency={currency} />
          )}
          {flow.review.open ? (
            <Button label={t('backToDetails')} secondary onPress={flow.back} disabled={flow.busy} />
          ) : null}
          <Button label={t('close')} secondary onPress={flow.close} disabled={flow.busy} />
        </BaseModal>
      ) : null}
    </>
  );
}
