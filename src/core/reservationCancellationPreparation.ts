import { z } from 'zod';
import { reservationCancellationInputSchema } from '../api/reservationCancellationContract';
import { reservationScopeSchema } from './reservationOperationRecord';
import { principalSchema } from './credentials';
export const reservationCancellationPreparationSchema = reservationScopeSchema
  .extend({
    principal: principalSchema.extend({ kind: z.literal('customer') }),
    request: reservationCancellationInputSchema,
  })
  .refine((record) => record.request.tenantId === record.tenantId);
export type ReservationCancellationPreparation = z.infer<
  typeof reservationCancellationPreparationSchema
>;
