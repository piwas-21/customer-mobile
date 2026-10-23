import type { TablePlanPreparation } from './tablePlanPreparation';
import type { TablePlanRecord } from './tablePlanRecord';
import type { TablePaymentPreparation } from './tablePaymentPreparation';
import type { TablePaymentRecord } from './tablePaymentRecord';
import type { TableVisitRecord } from './tableVisitRecord';
import type { TablePaymentReadScope } from './tablePaymentReadScope';
import type { TableRoundPreparation } from './tableRoundPreparation';
import type { TableRoundRecord } from './tableRoundRecord';
import type { ReservationCancellationPreparation } from './reservationCancellationPreparation';
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
    | 'table-account'
    | 'table-payment-account'
    | 'basket'
    | 'order'
    | 'order-receipt'
    | 'order-payment'
    | 'receipt-renewal'
    | 'payment-renewal'
    | 'order-cancellation'
    | 'cancellation-renewal'
    | 'reservation-prepare'
    | 'reservation-operation'
    | 'reservation-renewal'
    | 'table-round-prepare'
    | 'table-round-operation'
    | 'table-round-renewal'
    | 'table-payment-prepare'
    | 'table-payment-operation'
    | 'table-checkout-operation'
    | 'table-payment-renewal'
    | 'table-plan-prepare'
    | 'table-plan-operation'
    | 'table-plan-renewal';
  principal?: Principal;
  locale?: string;
  assertCurrent?: () => void;
  expectedBasketSessionId?: string;
  expectedTableVisit?: TableVisitRecord;
  expectedTablePaymentAccount?: TablePaymentReadScope;
  expectedPlanPreparation?: TablePlanPreparation;
  expectedPlanRecord?: TablePlanRecord;
  expectedRoundPreparation?: TableRoundPreparation;
  expectedRoundRecord?: TableRoundRecord;
  expectedContributionPreparation?: TablePaymentPreparation;
  expectedContributionRecord?: TablePaymentRecord;
  expectedOrderProof?: OrderOperationProof;
  expectedPaymentOrderId?: string;
  expectedCancellationRecord?: CancellationOperationRecord;
  expectedReservationPreparation?: ReservationPreparation | ReservationCancellationPreparation;
  expectedReservationRecord?: ReservationOperationRecord;
};
