import { z } from 'zod';
import { reservationEditInputSchema } from '../api/reservationEditContract';
import { reservationScopeSchema } from './reservationOperationRecord';
import { principalSchema } from './credentials';
export const reservationEditPreparationSchema = reservationScopeSchema
  .extend({
    principal: principalSchema.extend({ kind: z.literal('customer') }),
    draft: reservationEditInputSchema,
  })
  .refine((record) => record.draft.tenantId === record.tenantId);
export type ReservationEditPreparation = z.infer<typeof reservationEditPreparationSchema>;
