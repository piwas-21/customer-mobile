import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import { originSchema } from './directory';
import type { CredentialVault } from './credentials';
import type { TenantBoundary, TenantContext } from './tenantContext';
import { ApiFailure } from './apiFailure';
import { isReservationRecoveryPath } from './reservationPaths';
import { captureReservationRequest } from './reservationRequest';
import { captureCancellationRequest } from './cancellationRequest';
import { captureTableAccountRequest } from './tableAccountRequest';
import { captureTableRoundRequest, isTableRoundRecovery } from './tableRoundRequest';
import { requestHeaders } from './requestHeaders';
import type { Fetch, RequestOptions } from './httpTypes';
export { ApiFailure } from './apiFailure';
export type { Fetch, RequestOptions } from './httpTypes';
const envelopeSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  errors: z.array(z.string()).nullish(),
  message: z.string().nullish(),
});
const REQUEST_TIMEOUT_MS = 15_000;
export function apiUrl(origin: string, path: string): string {
  originSchema.parse(origin);
  if (!path.startsWith('/api/') || /[\\#\r\n]/.test(path)) throw new Error('Invalid API path');
  const url = new URL(path, origin);
  if (url.origin !== origin || !url.pathname.startsWith('/api/'))
    throw new Error('Invalid API destination');
  return url.toString();
}
async function decodeResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  if (response.redirected) throw new ApiFailure(response.status, 'contract');
  if (!response.ok) throw new ApiFailure(response.status, 'http');
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new ApiFailure(response.status, 'contract');
  const parsed = envelopeSchema.safeParse(await response.json());
  if (!parsed.success) throw new ApiFailure(response.status, 'contract');
  if (!parsed.data.success) throw new ApiFailure(response.status, 'refused');
  const data = schema.safeParse(parsed.data.data);
  if (!data.success) throw new ApiFailure(response.status, 'contract');
  return data.data;
}
export class CustomerTransport {
  constructor(
    private readonly boundary: TenantBoundary,
    private readonly vault: CredentialVault,
    private readonly fetcher: Fetch = expoFetch,
  ) {}
  async request<T>(
    context: TenantContext,
    path: string,
    schema: z.ZodType<T>,
    options: RequestOptions = {},
  ): Promise<T> {
    this.boundary.assertCurrent(context);
    options = captureTableRoundRequest(context, path, options);
    options = captureTableAccountRequest(context, path, options);
    options = captureCancellationRequest(context, path, options);
    options = captureReservationRequest(context, path, options);
    const assertOwner = options.assertCurrent ?? (() => {});
    assertOwner();
    const method = options.method ?? 'GET';
    const receiptRead = options.credentials === 'order-receipt';
    const paymentRecovery = options.credentials === 'order-payment';
    const cancellation = options.credentials === 'order-cancellation';
    const renewal =
      options.credentials === 'receipt-renewal' ||
      options.credentials === 'payment-renewal' ||
      options.credentials === 'cancellation-renewal' ||
      options.credentials === 'reservation-renewal' ||
      options.credentials === 'table-round-renewal';
    if (
      renewal &&
      (!options.assertCurrent || method !== 'POST' || path !== '/api/Auth/refresh-token')
    )
      throw new ApiFailure(401, 'refused');
    if (
      receiptRead &&
      (method !== 'POST' ||
        ![
          '/api/customer-mobile/orders/receipt',
          '/api/customer-mobile/orders/cancellation/original/prepare',
        ].includes(path))
    )
      throw new ApiFailure(401, 'refused');
    if (
      paymentRecovery &&
      (method !== 'POST' ||
        !options.assertCurrent ||
        path !== '/api/customer-mobile/checkout/payment/recover')
    )
      throw new ApiFailure(401, 'refused');
    const reservationRecovery =
      options.credentials === 'reservation-operation' && isReservationRecoveryPath(path);
    const orderRecovery =
      method === 'POST' &&
      options.credentials === 'order' &&
      (path === '/api/customer-mobile/checkout/recover' ||
        path === '/api/customer-mobile/checkout/cancel');
    if (
      method !== 'GET' &&
      context.tenant.status !== 'active' &&
      !orderRecovery &&
      !reservationRecovery &&
      !(options.credentials === 'table-round-operation' && isTableRoundRecovery(path)) &&
      !receiptRead &&
      !paymentRecovery &&
      !cancellation &&
      !renewal
    )
      throw new Error('Restaurant is read-only');
    // Snapshot the wire body before asynchronous credential reads can yield to UI changes.
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    const headers = await requestHeaders(context, this.vault, options);
    this.boundary.assertCurrent(context);
    assertOwner();
    const controller = new AbortController();
    const cancel = () => controller.abort();
    context.signal.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetcher(apiUrl(context.tenant.apiOrigin, path), {
        method,
        headers,
        redirect: 'error',
        credentials: 'omit',
        signal: controller.signal,
        ...(body === undefined ? {} : { body }),
      });
      this.boundary.assertCurrent(context);
      assertOwner();
      const data = await decodeResponse(response, schema);
      this.boundary.assertCurrent(context);
      assertOwner();
      return data;
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      throw new ApiFailure(0, 'network');
    } finally {
      clearTimeout(timer);
      context.signal.removeEventListener('abort', cancel);
    }
  }
}
export async function fetchDirectory(origin: string, fetcher: Fetch = expoFetch): Promise<unknown> {
  originSchema.parse(origin);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetcher(`${origin}/v1/directory`, {
      redirect: 'error',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (
      response.redirected ||
      !response.ok ||
      !response.headers.get('content-type')?.includes('application/json')
    )
      throw new ApiFailure(response.status, 'http');
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
