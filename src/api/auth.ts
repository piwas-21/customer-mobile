import {
  scopedReservationRecord,
  type ReservationOperationRecord,
} from '../core/reservationOperationRecord';
import type { RequestOptions } from '../core/httpTypes';
import type { CancellationOperationRecord } from '../core/cancellationOperationRecord';
import type { OrderOperationProof } from '../core/orderOperationProof';
import { z } from 'zod';
import { ApiFailure, type CustomerTransport } from '../core/transport';
import type { TenantContext } from '../core/tenantContext';
import { credentialSecretSchema, type CustomerSession } from '../core/credentials';
const authSchema = z.object({
  userId: z.uuid(),
  role: z.literal('Customer'),
  accessToken: credentialSecretSchema,
  refreshToken: credentialSecretSchema,
});
export const loginSchema = z
  .object({
    email: z.string().trim().max(254).pipe(z.email()),
    password: z.string().min(1).max(1024),
  })
  .strict();
export type LoginInput = z.infer<typeof loginSchema>;
export async function signIn(
  client: CustomerTransport,
  context: TenantContext,
  input: LoginInput,
  locale: string,
): Promise<CustomerSession> {
  const response = await client.request(context, '/api/Auth/login', authSchema, {
    method: 'POST',
    body: loginSchema.parse(input),
    locale,
  });
  return {
    userId: response.userId,
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
  };
}
export async function refreshSession(
  client: CustomerTransport,
  context: TenantContext,
  session: CustomerSession,
  assertCurrent?: () => void,
  receiptProof?: OrderOperationProof,
  paymentOrderId?: string,
  cancellation?: CancellationOperationRecord,
): Promise<CustomerSession> {
  const captured = { ...session };
  if (
    cancellation &&
    (receiptProof ||
      paymentOrderId ||
      cancellation.principal.kind !== 'customer' ||
      cancellation.principal.id !== captured.userId)
  )
    throw new ApiFailure(401, 'refused');
  if (paymentOrderId !== undefined && !receiptProof) throw new ApiFailure(401, 'refused');
  if (
    receiptProof &&
    (receiptProof.principal.kind !== 'customer' || receiptProof.principal.id !== captured.userId)
  )
    throw new ApiFailure(401, 'refused');
  return requestSessionRefresh(client, context, captured, {
    ...(assertCurrent ? { assertCurrent } : {}),
    ...(cancellation
      ? {
          credentials: 'cancellation-renewal' as const,
          principal: cancellation.principal,
          expectedCancellationRecord: cancellation,
        }
      : {}),
    ...(receiptProof
      ? {
          credentials: paymentOrderId ? ('payment-renewal' as const) : ('receipt-renewal' as const),
          ...(paymentOrderId ? { expectedPaymentOrderId: paymentOrderId } : {}),
          principal: receiptProof.principal,
          expectedOrderProof: receiptProof,
        }
      : {}),
  });
}
export function refreshReservationSession(
  client: CustomerTransport,
  context: TenantContext,
  session: CustomerSession,
  assertCurrent: () => void,
  input: ReservationOperationRecord,
) {
  const record = scopedReservationRecord(context, input.principal, input);
  if (
    record.principal.kind !== 'customer' ||
    record.principal.id !== session.userId ||
    record.resolution
  )
    throw new ApiFailure(401, 'refused');
  return requestSessionRefresh(
    client,
    context,
    { ...session },
    {
      credentials: 'reservation-renewal',
      principal: record.principal,
      expectedReservationRecord: record,
      assertCurrent,
    },
  );
}
async function requestSessionRefresh(
  client: CustomerTransport,
  context: TenantContext,
  captured: CustomerSession,
  options: RequestOptions,
): Promise<CustomerSession> {
  const response = await client.request(context, '/api/Auth/refresh-token', authSchema, {
    ...options,
    method: 'POST',
    body: { accessToken: captured.accessToken, refreshToken: captured.refreshToken },
  });
  if (response.userId !== captured.userId) throw new ApiFailure(200, 'contract');
  return {
    userId: response.userId,
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
  };
}
