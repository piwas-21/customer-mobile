import type {
  CancellationPreparation,
  CancellationResolution,
} from '../api/orderCancellationContract';
export type CancellationView = {
  operationId: string;
  orderId: string;
  outcome: 'Pending' | 'Unseen' | 'Cancelled' | 'Refused';
  reason: CancellationResolution['reason'];
};
export type CancellationOffer = Pick<CancellationPreparation, 'orderId' | 'allowed' | 'reason'>;
