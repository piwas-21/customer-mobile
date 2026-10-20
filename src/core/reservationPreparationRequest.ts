import { z } from 'zod';
import { reservationPreparationSchema, assertReservationScope } from './reservationOperationRecord';
import { reservationCancellationPreparationSchema } from './reservationCancellationPreparation';
import { reservationCreatePath, reservationCancellationPath } from './reservationPaths';
import { ApiFailure } from './apiFailure';
import type { TenantContext } from './tenantContext';
import type { RequestOptions } from './httpTypes';
export const anyReservationPreparationSchema = z.union([
  reservationPreparationSchema,
  reservationCancellationPreparationSchema,
]);
export function captureReservationPreparation(
  context: TenantContext,
  path: string,
  options: RequestOptions,
): RequestOptions {
  if (options.expectedReservationRecord !== undefined || !options.principal)
    throw new ApiFailure(401, 'refused');
  const prepared = anyReservationPreparationSchema.parse(options.expectedReservationPreparation);
  assertReservationScope(context, options.principal, prepared);
  const cancellation = 'request' in prepared;
  const expected = cancellation ? prepared.request : prepared.draft;
  const destination =
    (cancellation ? reservationCancellationPath : reservationCreatePath) + '/prepare';
  const body = cancellation
    ? reservationCancellationPreparationSchema.shape.request.parse(options.body)
    : reservationPreparationSchema.shape.draft.parse(options.body);
  if (path !== destination || JSON.stringify(body) !== JSON.stringify(expected))
    throw new ApiFailure(401, 'refused');
  return {
    ...options,
    principal: prepared.principal,
    expectedReservationPreparation: prepared,
    body,
  };
}
