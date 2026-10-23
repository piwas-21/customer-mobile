import type { TablePaymentRecord } from './tablePaymentRecord';
export type TableContributionView = Readonly<{
  operationId: string;
  serviceSessionId: string;
  attemptId: string | null;
  mode: TablePaymentRecord['review']['mode'];
  amountMinor: number;
  currency: string;
  state: 'uncertain' | 'reserved' | 'pending' | 'paid' | 'stopped';
  canOpen: boolean;
}>;
export function tableContributionView(
  record: TablePaymentRecord,
  canOpen = false,
): TableContributionView {
  const state =
    record.resolution?.outcome === 'Stopped'
      ? 'stopped'
      : (record.checkout?.outcome ??
        (record.resolution?.outcome === 'Applied' ? 'reserved' : 'uncertain'));
  return {
    operationId: record.proof.operationId,
    serviceSessionId: record.intent.serviceSessionId,
    attemptId: record.resolution?.attemptId ?? null,
    mode: record.review.mode,
    amountMinor: record.review.amountMinor,
    currency: record.review.currency,
    state,
    canOpen,
  };
}
