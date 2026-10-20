import {
  captureOrderProof,
  orderRequestHeaders,
  type OrderProofSource,
} from './orderRequestHeaders';
import { reservationRequestHeaders } from './reservationRequest';
import { cancellationRequestHeaders } from './cancellationRequest';
import { canonicalUuidSchema } from './identifiers';
import { ApiFailure } from './apiFailure';
import type { CredentialVault, Principal } from './credentials';
import type { TenantContext } from './tenantContext';
import type { RequestOptions } from './httpTypes';

function expectedBasketSession(options: RequestOptions): string | undefined {
  const expected = options.expectedBasketSessionId;
  if (expected === undefined) return undefined;
  if (options.credentials !== 'basket' || !canonicalUuidSchema.safeParse(expected).success)
    throw new ApiFailure(401, 'refused');
  return expected;
}

async function customerHeaders(
  context: TenantContext,
  vault: CredentialVault,
  principal: Principal | undefined,
): Promise<Record<string, string>> {
  if (principal?.kind !== 'customer') throw new ApiFailure(401, 'refused');
  const session = await vault.session(context, principal.id);
  if (!session) throw new ApiFailure(401, 'refused');
  return { Authorization: `Bearer ${session.accessToken}` };
}

async function sessionHeaders(
  context: TenantContext,
  vault: CredentialVault,
  principal: Principal | undefined,
  mode: 'basket' | 'guest' | 'table',
  expectedSession: string | undefined,
): Promise<Record<string, string>> {
  if (!principal || (mode !== 'basket' && principal.kind !== 'guest'))
    throw new ApiFailure(401, 'refused');
  const session = await vault.capability(context, 'guest-session', principal);
  if (!session) throw new ApiFailure(401, 'refused');
  if (mode === 'basket' && !canonicalUuidSchema.safeParse(session).success)
    throw new ApiFailure(401, 'refused');
  if (expectedSession !== undefined && session !== expectedSession)
    throw new ApiFailure(401, 'refused');
  const headers: Record<string, string> = { 'X-Session-Id': session };
  if (mode === 'table') {
    const participant = await vault.capability(context, 'table-participant', principal);
    if (!participant) throw new ApiFailure(401, 'refused');
    headers['X-Table-Participant'] = participant;
  }
  return headers;
}

function orderProofSource(mode: RequestOptions['credentials']): OrderProofSource {
  if (mode === 'order-payment' || mode === 'payment-renewal') return 'payment';
  if (mode === 'order-receipt' || mode === 'receipt-renewal') return 'receipt';
  return 'pending';
}

export async function requestHeaders(
  context: TenantContext,
  vault: CredentialVault,
  options: RequestOptions,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.locale) headers['Accept-Language'] = options.locale;
  const mode = options.credentials ?? 'none';
  const expectedSession = expectedBasketSession(options);
  const orderProof = captureOrderProof(context, options);
  const paymentOrderId = options.expectedPaymentOrderId;
  const principal = options.principal ? Object.freeze({ ...options.principal }) : undefined;
  if (
    mode === 'reservation-prepare' ||
    mode === 'reservation-operation' ||
    mode === 'reservation-renewal'
  )
    Object.assign(headers, await reservationRequestHeaders(context, vault, options));
  if (mode === 'order-cancellation' || mode === 'cancellation-renewal')
    Object.assign(headers, await cancellationRequestHeaders(context, vault, options));
  if (
    mode === 'customer' ||
    ((mode === 'basket' ||
      mode === 'order' ||
      mode === 'order-receipt' ||
      mode === 'order-payment') &&
      principal?.kind === 'customer')
  )
    Object.assign(headers, await customerHeaders(context, vault, principal));
  if (orderProof)
    Object.assign(
      headers,
      await orderRequestHeaders(context, vault, orderProof, orderProofSource(mode), paymentOrderId),
    );
  if (mode === 'guest' || mode === 'table' || mode === 'basket')
    Object.assign(headers, await sessionHeaders(context, vault, principal, mode, expectedSession));
  return headers;
}
