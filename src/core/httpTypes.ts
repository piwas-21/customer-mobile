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
    | 'receipt-renewal';
  principal?: Principal;
  locale?: string;
  assertCurrent?: () => void;
  expectedBasketSessionId?: string;
  expectedOrderProof?: OrderOperationProof;
};
