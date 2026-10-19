import { useTranslation } from 'react-i18next';
import type { useBasket } from './BasketProvider';
import useCheckoutFlow from './useCheckoutFlow';
import CheckoutFields from './CheckoutFields';
import CheckoutSummary from './CheckoutSummary';
import Button from '../../ui/Button';
import BaseModal from '../../ui/BaseModal';
import SavedAddressesModal from '../account/SavedAddressesModal';
import useCheckoutSavedAddress from './useCheckoutSavedAddress';
export default function CheckoutControl({
  basket,
  currency,
}: Readonly<{ basket: ReturnType<typeof useBasket>; currency?: string | undefined }>) {
  const { t } = useTranslation();
  const flow = useCheckoutFlow(basket);
  const addresses = useCheckoutSavedAddress(
    flow.open && !flow.review.open && !flow.busy && Boolean(flow.fields.fields?.address.length),
    flow.applyAddress,
  );
  return (
    <>
      {flow.allowed ? <Button label={t('checkout')} onPress={flow.show} /> : null}
      {addresses.current ? (
        <SavedAddressesModal
          key={addresses.current.ownerVersion}
          {...addresses.current}
          onClose={addresses.close}
          onSelect={addresses.select}
        />
      ) : flow.open ? (
        <BaseModal title={t('checkout')} onClose={flow.close}>
          {flow.review.open ? (
            <CheckoutSummary flow={flow} />
          ) : (
            <>
              {addresses.available ? (
                <Button label={t('chooseSavedAddress')} secondary onPress={addresses.show} />
              ) : null}
              <CheckoutFields flow={flow} currency={currency} />
            </>
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
