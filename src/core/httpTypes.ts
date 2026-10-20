import type {
  ReservationOperationRecord,
  ReservationPreparation,
} from './reservationOperationRecord';
import type { CancellationOperationRecord } from './cancellationOperationRecord';
import type { OrderOperationProof } from './orderOperationProof';
import type { Principal } from './credentials';
export type Fetch = (
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    redirect?: 'error';
    credentials?: 'omit';
    signal?: AbortSignal;
    body?: string;
  },
) => Promise<Response>;
export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  credentials?:
    | 'none'
    | 'customer'
    | 'guest'
    | 'table'
    | 'basket'
    | 'order'
    | 'order-receipt'
    | 'order-payment'
    | 'receipt-renewal'
    | 'payment-renewal'
    | 'order-cancellation'
    | 'cancellation-renewal'
    | 'reservation-prepare'
    | 'reservation-operation';
  principal?: Principal;
  locale?: string;
  assertCurrent?: () => void;
  expectedBasketSessionId?: string;
  expectedOrderProof?: OrderOperationProof;
  expectedPaymentOrderId?: string;
  expectedCancellationRecord?: CancellationOperationRecord;
  expectedReservationPreparation?: ReservationPreparation;
  expectedReservationRecord?: ReservationOperationRecord;
};
