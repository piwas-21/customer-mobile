import type { CustomerCancellationController } from '../../core/customerCancellationController';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCancellation } from './CancellationProvider';
import Button from '../../ui/Button';
import BaseModal from '../../ui/BaseModal';
import Feedback from '../../ui/Feedback';
export default function CancellationNotice() {
  const state = useCancellation();
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState<{
    controller: CustomerCancellationController;
    operationId: string;
  }>();
  if (!state || (!state.value && !state.failed)) return null;
  const value = state.value;
  return (
    <View>
      {value ? <Feedback message={t(`cancellation.outcome.${value.outcome}`)} /> : null}
      {value?.reason ? <Feedback message={t(`cancellation.reason.${value.reason}`)} /> : null}
      {state.failed ? <Feedback message={t('cancellation.unknown')} /> : null}
      <Button
        secondary
        label={t('cancellation.check')}
        disabled={state.busy || state.loading}
        onPress={state.refresh}
      />
      {value?.outcome === 'Unseen' ? (
        <Button
          secondary
          label={t('cancellation.retry')}
          disabled={state.busy || state.loading}
          onPress={() => {
            if (state.controller)
              setConfirming({ controller: state.controller, operationId: value.operationId });
          }}
        />
      ) : null}
      {confirming?.controller === state.controller &&
      confirming &&
      confirming.operationId === value?.operationId &&
      value?.outcome === 'Unseen' ? (
        <BaseModal title={t('cancellation.retry')} onClose={() => setConfirming(undefined)}>
          <Feedback message={t('cancellation.retryExplanation')} />
          <Button
            destructive
            label={t('cancellation.confirmRetry')}
            disabled={state.busy || state.loading}
            onPress={() => {
              if (
                !state.busy &&
                !state.loading &&
                state.value?.outcome === 'Unseen' &&
                state.value.operationId === confirming.operationId
              ) {
                setConfirming(undefined);
                state.retry(confirming.operationId);
              }
            }}
          />
          <Button secondary label={t('close')} onPress={() => setConfirming(undefined)} />
        </BaseModal>
      ) : null}
    </View>
  );
}
