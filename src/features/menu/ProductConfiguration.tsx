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
  const { t } = useTranslation();
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
  return <GuidedProduct product={product} details={details.data} />;
}
