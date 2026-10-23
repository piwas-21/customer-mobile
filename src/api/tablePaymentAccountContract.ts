import { z } from 'zod';
import { canonicalUuidSchema } from '../core/identifiers';
import { utcSortMarkerSchema } from '../core/utcSortMarker';
import { tableAccountRevision } from './tableAccountContract';
import { tablePaymentCurrency, tablePaymentMinor } from '../domain/tablePaymentMoney';

const positiveMinor = tablePaymentMinor.min(1);
const positiveInt = z.int32().min(1);
const maximumSegments = 5_000;
const maximumShares = 1_000;
export const tablePaymentStateSchema = z.enum([
  'Quoted',
  'Reserved',
  'Starting',
  'Processing',
  'Captured',
  'CancelRequested',
  'Released',
  'Failed',
  'ReconciliationRequired',
]);
export const tablePaymentAllocationSchema = z.strictObject({
  orderId: canonicalUuidSchema,
  orderItemId: canonicalUuidSchema.nullable(),
  startOrdinal: positiveInt,
  unitCount: positiveInt,
  minorPerUnit: positiveMinor,
  amountMinor: positiveMinor,
});
const allocations = z.array(tablePaymentAllocationSchema).max(maximumSegments);
const slot = z.strictObject({
  ordinal: positiveInt.max(maximumShares),
  amountMinor: positiveMinor,
  claimState: tablePaymentStateSchema.nullable(),
  isAvailable: z.boolean(),
});
const plan = z
  .strictObject({
    planId: canonicalUuidSchema,
    accountRevision: tableAccountRevision,
    totalMinor: positiveMinor,
    shareCount: positiveInt.min(2).max(maximumShares),
    currency: tablePaymentCurrency,
    isOwnPlan: z.boolean(),
    slots: z.array(slot).max(maximumShares),
    scope: allocations,
    isCustom: z.boolean(),
    customAmountsMinor: z.array(positiveMinor).max(maximumShares).nullable(),
  })
  .superRefine((value, issues) => {
    if (
      value.slots.length !== value.shareCount ||
      new Set(value.slots.map((item) => item.ordinal)).size !== value.shareCount ||
      value.slots.some((item) => item.ordinal > value.shareCount) ||
      (value.customAmountsMinor !== null && value.customAmountsMinor.length !== value.shareCount)
    )
      issues.addIssue({ code: 'custom', message: 'Unbound share positions' });
  });
const attempt = z
  .strictObject({
    operationId: canonicalUuidSchema.nullable(),
    state: tablePaymentStateSchema,
    version: positiveInt,
    paymentMethod: z.enum([
      'Cash',
      'CreditCard',
      'DebitCard',
      'OnlinePayment',
      'MobilePayment',
      'BankTransfer',
    ]),
    amountMinor: positiveMinor,
    currency: tablePaymentCurrency,
    reservationExpiresAt: utcSortMarkerSchema.nullable(),
    equalSharePlanId: canonicalUuidSchema.nullable(),
    equalShareOrdinal: positiveInt.nullable(),
    isOwnOperation: z.boolean(),
  })
  .refine(
    (value) => value.isOwnOperation === (value.operationId !== null),
    'Unredacted payment identity',
  );
const limits = z.strictObject({
  maximumSelectedUnits: positiveInt.max(maximumShares),
  maximumEqualShares: positiveInt.max(maximumShares),
  online: z
    .strictObject({
      currency: tablePaymentCurrency,
      minimumAmountMinor: positiveMinor,
      maximumAmountMinor: positiveMinor,
    })
    .refine(
      (value) => value.minimumAmountMinor <= value.maximumAmountMinor,
      'Invalid contribution bounds',
    )
    .nullable(),
});
const account = z
  .strictObject({
    serviceSessionId: canonicalUuidSchema,
    status: z.literal('Open'),
    accountRevision: tableAccountRevision,
    currency: tablePaymentCurrency,
    outstandingMinor: tablePaymentMinor,
    reservedMinor: tablePaymentMinor,
    availableMinor: tablePaymentMinor,
    capturedAccountPaymentMinor: tablePaymentMinor,
    outstandingAllocations: allocations,
    availableAllocations: allocations,
    activeEqualSharePlan: plan.nullable(),
    activeAttempts: z.array(attempt).max(1_000),
    limits,
    billingAllocationVersion: z.union([z.literal(0), z.literal(1)]),
  })
  .superRefine((value, issues) => {
    if (
      (value.activeEqualSharePlan && value.activeEqualSharePlan.currency !== value.currency) ||
      value.activeAttempts.some((item) => item.currency !== value.currency) ||
      (value.limits.online && value.limits.online.currency !== value.currency)
    )
      issues.addIssue({ code: 'custom', message: 'Unbound payment currency' });
  });
export const tablePaymentAccountSchema = z.strictObject({
  schemaVersion: z.literal(1),
  tenantId: canonicalUuidSchema,
  account,
});
export type TablePaymentAccount = z.infer<typeof tablePaymentAccountSchema>;
