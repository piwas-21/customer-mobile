import { useMemo, useState } from 'react';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import { useTranslation } from 'react-i18next';
import type { ProductDetail, OrderType } from '../../api/productDetail';
import useSideDetails from './useSideDetails';
import GuidedProduct from './GuidedProduct';
import Feedback from '../../ui/Feedback';
export default function ProductConfiguration({
  product,
  channel,
}: Readonly<{
  product: ProductDetail;
  channel: OrderType | undefined;
}>) {
  const details = useSideDetails(product, channel);
  const { context } = useRestaurant();
  const { controller, userId, ownerVersion, loading, failed, retry } = useSession();
  const scope = useMemo(
    () => ({ context, controller, userId, ownerVersion }),
    [context, controller, userId, ownerVersion],
  );
  const [owner, setOwner] = useState({ scope, key: 0 });
  if (owner.scope !== scope) setOwner({ scope, key: owner.key + 1 });
  const { t } = useTranslation();
  if (!controller)
    return (
      <Feedback
        loading={loading}
        message={t(failed ? 'sessionUnavailable' : 'loading')}
        retry={failed ? retry : undefined}
      />
    );
  if (!details.data)
    return (
      <Feedback
        loading={details.isPending && !details.unsupported}
        message={t(details.isError || details.unsupported ? 'menuUnavailable' : 'loading')}
        retry={
          details.isError
            ? () => {
                void details.refetch();
              }
            : undefined
        }
      />
    );
  return <GuidedProduct key={owner.key} product={product} details={details.data} />;
}
