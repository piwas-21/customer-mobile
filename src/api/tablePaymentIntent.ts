import { z } from 'zod';
import { canonicalUuidSchema } from '../core/identifiers';
import { tableAccountRevision } from './tableAccountContract';
import { tablePaymentMinor } from '../domain/tablePaymentMoney';
export const tablePaymentModeSchema = z.enum(['Items', 'Amount', 'Equal', 'CustomAmount', 'Full']);
const ordinal = z.int32().min(1);
export const tablePaymentUnitSchema = z.strictObject({
  orderId: canonicalUuidSchema,
  orderItemId: canonicalUuidSchema.nullable(),
  ordinal,
});
export const tablePaymentIntentSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    tenantId: canonicalUuidSchema,
    operationId: canonicalUuidSchema,
    serviceSessionId: canonicalUuidSchema,
    expectedAccountRevision: tableAccountRevision,
    mode: tablePaymentModeSchema,
    selectedUnits: z.array(tablePaymentUnitSchema).max(1_000),
    amountMinor: tablePaymentMinor.min(1).nullable(),
    equalSharePlanId: canonicalUuidSchema.nullable(),
    equalShareOrdinal: ordinal.nullable(),
    customSharePlanId: canonicalUuidSchema.nullable(),
    customShareOrdinal: ordinal.nullable(),
  })
  .superRefine((value, issues) => {
    const noUnits = value.selectedUnits.length === 0;
    const noPlans =
      value.equalSharePlanId === null &&
      value.equalShareOrdinal === null &&
      value.customSharePlanId === null &&
      value.customShareOrdinal === null;
    const noAmount = value.amountMinor === null;
    let valid = false;
    switch (value.mode) {
      case 'Full':
        valid = noUnits && noPlans && noAmount;
        break;
      case 'Amount':
        valid = noUnits && noPlans && !noAmount;
        break;
      case 'Items':
        valid = !noUnits && noPlans && noAmount;
        break;
      case 'Equal':
        valid =
          noUnits &&
          noAmount &&
          value.equalSharePlanId !== null &&
          value.equalShareOrdinal !== null &&
          value.customSharePlanId === null &&
          value.customShareOrdinal === null;
        break;
      case 'CustomAmount':
        valid =
          noUnits &&
          noAmount &&
          value.customSharePlanId !== null &&
          value.customShareOrdinal !== null &&
          value.equalSharePlanId === null &&
          value.equalShareOrdinal === null;
        break;
    }
    const units = value.selectedUnits.map((unit) => JSON.stringify(unit));
    if (!valid || new Set(units).size !== units.length)
      issues.addIssue({
        code: 'custom',
        message: 'Contribution fields do not match the selected mode',
      });
  });
export type TablePaymentIntent = z.infer<typeof tablePaymentIntentSchema>;
