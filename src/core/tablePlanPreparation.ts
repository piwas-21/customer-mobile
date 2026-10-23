import { z } from 'zod';
import { tablePlanIntentSchema } from '../api/tablePlanIntent';
import {
  tablePreparationFields,
  tablePreparationBound,
  scopedTablePreparation,
} from './tablePreparationAuthority';
import type { Principal } from './credentials';
import type { TenantContext } from './tenantContext';
export const tablePlanPreparationSchema = z
  .strictObject({
    ...tablePreparationFields,
    intent: tablePlanIntentSchema,
  })
  .refine(tablePreparationBound);
export type TablePlanPreparation = z.infer<typeof tablePlanPreparationSchema>;
export function scopedTablePlanPreparation(
  context: TenantContext,
  principal: Principal,
  value: unknown,
) {
  return scopedTablePreparation(context, principal, value, (input) =>
    tablePlanPreparationSchema.parse(input),
  );
}
