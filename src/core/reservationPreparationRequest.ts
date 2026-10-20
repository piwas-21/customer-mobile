import { reservationEditPreparationSchema } from './reservationEditPreparation';
import { z } from 'zod';
import { reservationPreparationSchema, assertReservationScope } from './reservationOperationRecord';
import { reservationCancellationPreparationSchema } from './reservationCancellationPreparation';
import {
  reservationCreatePath,
  reservationCancellationPath,
  reservationEditPath,
} from './reservationPaths';
import { ApiFailure } from './apiFailure';
import type { TenantContext } from './tenantContext';
import type { RequestOptions } from './httpTypes';
export const anyReservationPreparationSchema = z.union([
  reservationPreparationSchema,
  reservationCancellationPreparationSchema,
  reservationEditPreparationSchema,
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
  const edit = !cancellation && 'reservationId' in prepared.draft;
  const expected = cancellation ? prepared.request : prepared.draft;
  let destination: string;
  let body: unknown;
  if (cancellation) {
    destination = reservationCancellationPath + '/prepare';
    body = reservationCancellationPreparationSchema.shape.request.parse(options.body);
  } else if (edit) {
    destination = reservationEditPath + '/prepare';
    body = reservationEditPreparationSchema.shape.draft.parse(options.body);
  } else {
    destination = reservationCreatePath + '/prepare';
    body = reservationPreparationSchema.shape.draft.parse(options.body);
  }
  if (path !== destination || JSON.stringify(body) !== JSON.stringify(expected))
    throw new ApiFailure(401, 'refused');
  return {
    ...options,
    principal: prepared.principal,
    expectedReservationPreparation: prepared,
    body,
  };
}
