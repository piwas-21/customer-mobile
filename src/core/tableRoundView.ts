import type { TableRoundRecord } from './tableRoundRecord';
export type TableRoundView = Readonly<{
  operationId: string;
  serviceSessionId: string;
  cancellationRequested: boolean;
  outcome: 'Pending' | 'Applied' | 'Cancelled';
  orderId: string | null;
}>;
export function tableRoundView(record: TableRoundRecord): TableRoundView {
  return {
    operationId: record.proof.operationId,
    serviceSessionId: record.intent.serviceSessionId,
    cancellationRequested: record.cancellationRequested,
    outcome:
      record.resolution && record.resolution.outcome !== 'Unseen'
        ? record.resolution.outcome
        : 'Pending',
    orderId: record.resolution?.orderId ?? null,
  };
}
