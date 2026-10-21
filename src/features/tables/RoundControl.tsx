import useMounted from '../../core/useMounted';
import { useLayoutEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TableRoundReviewView } from '../../core/tableRoundController';
import { requireTableRoundEnabled } from '../../core/tableRoundPolicy';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
import type { useBasket } from '../basket/BasketProvider';
import { useTableRound } from './RoundProvider';
import RoundReviewModal from './RoundReviewModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';

type Props = Readonly<{ basket: ReturnType<typeof useBasket> }>;
export default function RoundControl(props: Props) {
  const flow = useTableRound();
  return flow ? <ConnectedRoundControl {...props} flow={flow} /> : null;
}
function ConnectedRoundControl({
  basket,
  flow,
}: Props & { flow: NonNullable<ReturnType<typeof useTableRound>> }) {
  const mounted = useMounted();
  const { context } = useRestaurant();
  const { userId } = useSession();
  const bootstrap = useBootstrap().data;
  const { t } = useTranslation();
  const router = useRouter();
  const controller = flow?.controller;
  const scope = useMemo(
    () => ({
      controller,
      basketId: basket.basket?.id,
      fingerprint: basket.basket?.purchaseFingerprint,
      failed: flow?.failed,
      bootstrap,
    }),
    [controller, basket.basket?.id, basket.basket?.purchaseFingerprint, flow?.failed, bootstrap],
  );
  const [review, setReview] = useState<{ scope: typeof scope; value: TableRoundReviewView }>();
  useLayoutEffect(
    () => () => {
      if (!review) return;
      try {
        review.scope.controller?.dismiss(review.value.operationId);
      } catch {
        /* Withdrawn review. */
      }
    },
    [review, scope],
  );
  useLayoutEffect(() => () => scope.controller?.invalidateReview(), [scope]);
  let allowed = false;
  try {
    if (context && bootstrap) {
      requireTableRoundEnabled(
        context,
        bootstrap,
        userId ? { kind: 'customer', id: userId } : { kind: 'guest', id: 'basket' },
      );
      allowed = true;
    }
  } catch {
    /* Current configuration refuses new rounds; original recovery stays visible. */
  }
  if (!flow || !allowed || basket.basket?.orderType !== 'DineIn') return null;
  const current = review?.scope === scope ? review.value : undefined;
  const ready = Boolean(
    controller &&
    basket.canAdd &&
    flow.value === null &&
    !flow.loading &&
    !flow.busy &&
    !flow.failed,
  );
  async function show() {
    if (!ready || !controller) return;
    try {
      const value = await flow!.prepare();
      controller.assertCurrent();
      if (!mounted.current) {
        controller.dismiss(value.operationId);
        return;
      }
      setReview({ scope, value });
    } catch {
      /* The shared state displays failure and any retained original attempt. */
    }
  }
  return (
    <>
      {flow.busy ? <Feedback loading message={t('loading')} /> : null}
      <Feedback message={t('tableRoundReviewHint')} />
      <Button label={t('tableRoundReview')} disabled={!ready} onPress={() => void show()} />
      <Button
        label={t('tableScan')}
        secondary
        disabled={flow.busy}
        onPress={() => router.push('/scan')}
      />
      {current ? (
        <RoundReviewModal
          review={current}
          busy={flow.busy}
          onClose={() => {
            if (!flow.busy) setReview(undefined);
          }}
          onConfirm={() => {
            const id = current.operationId;
            void flow
              .confirm(id)
              .catch(() => undefined)
              .finally(() =>
                setReview((previous) =>
                  previous?.scope === scope && previous.value.operationId === id
                    ? undefined
                    : previous,
                ),
              );
          }}
        />
      ) : null}
    </>
  );
}
