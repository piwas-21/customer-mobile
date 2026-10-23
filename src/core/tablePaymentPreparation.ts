import { z } from 'zod';
import { tablePaymentIntentSchema } from '../api/tablePaymentIntent';
import {
  tablePreparationFields,
  tablePreparationBound,
  scopedTablePreparation,
} from './tablePreparationAuthority';
import type { Principal } from './credentials';
import type { TenantContext } from './tenantContext';
export const tablePaymentPreparationSchema = z
  .strictObject({
    ...tablePreparationFields,
    intent: tablePaymentIntentSchema,
  })
  .refine(tablePreparationBound);
export type TablePaymentPreparation = z.infer<typeof tablePaymentPreparationSchema>;
export function scopedTablePaymentPreparation(
  context: TenantContext,
  principal: Principal,
  value: unknown,
) {
  return scopedTablePreparation(context, principal, value, (input) =>
    tablePaymentPreparationSchema.parse(input),
  );
}
