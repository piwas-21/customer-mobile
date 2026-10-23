import type { TablePlanRecord } from './tablePlanRecord';
export function tablePlanView(record: TablePlanRecord) {
  return {
    operationId: record.proof.operationId,
    outcome: record.resolution?.outcome ?? 'pending',
    totalMinor: record.review.totalMinor,
    currency: record.review.currency,
    sharesMinor: [...record.review.sharesMinor],
    stopping: record.cancellationRequested,
  } as const;
}
export type TablePlanView = ReturnType<typeof tablePlanView>;
