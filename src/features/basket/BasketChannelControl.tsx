import { useTranslation } from 'react-i18next';
import type { useBasket } from './BasketProvider';
import useBasketChannelChoice from './useBasketChannelChoice';
import useOrderTypes from './useOrderTypes';
import BasketChannelReview from './BasketChannelReview';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
export default function BasketChannelControl({
  basket,
}: Readonly<{ basket: ReturnType<typeof useBasket> }>) {
  const { t } = useTranslation();
  const choice = useBasketChannelChoice(basket);
  const types = useOrderTypes(choice.open);
  const current = basket.basket?.orderType;
  const preview = choice.preview;
  const ready = basket.canAdd && Boolean(preview && types.data?.includes(preview.orderType));
  const failure = choice.failed ? (
    <>
      <Feedback message={t('channelChangeFailed')} />
      <Button
        secondary
        label={t('reviewBasket')}
        disabled={choice.busy}
        onPress={() => {
          choice.close();
          void basket.refresh();
        }}
      />
    </>
  ) : null;
  return (
    <>
      <Button
        secondary
        label={
          current ? t('changeOrderType', { type: t(`orderType${current}`) }) : t('chooseOrderType')
        }
        disabled={!basket.canAdd}
        onPress={choice.show}
      />
      {choice.open ? (
        <BaseModal title={t('chooseOrderType')} onClose={choice.close} scroll={!preview}>
          {!preview ? failure : null}
          {preview ? (
            <BasketChannelReview
              preview={preview}
              failure={failure}
              ready={ready}
              changed={choice.changed}
              busy={choice.busy}
              confirm={() => {
                void choice.confirm();
              }}
              back={choice.back}
            />
          ) : (
            <ChannelOptions types={types} choice={choice} ready={basket.canAdd} />
          )}
        </BaseModal>
      ) : null}
    </>
  );
}

function ChannelOptions({
  types,
  choice,
  ready,
}: Readonly<{
  types: ReturnType<typeof useOrderTypes>;
  choice: ReturnType<typeof useBasketChannelChoice>;
  ready: boolean;
}>) {
  const { t } = useTranslation();
  return (
    <>
      {types.data?.length ? (
        types.data.map((type) => (
          <Button
            key={type}
            label={t(`orderType${type}`)}
            busy={choice.busy}
            disabled={!ready}
            onPress={() => {
              void choice.prepare(type);
            }}
          />
        ))
      ) : (
        <Feedback
          loading={types.isPending}
          message={t(types.isPending ? 'loading' : 'orderTypesUnavailable')}
          retry={
            types.isError
              ? () => {
                  void types.refetch();
                }
              : undefined
          }
        />
      )}
      <Button secondary label={t('close')} disabled={choice.busy} onPress={choice.close} />
    </>
  );
}
