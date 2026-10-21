import { z } from 'zod';
import { ApiFailure } from '../core/apiFailure';
import { canonicalUuidSchema } from '../core/identifiers';
import { originalOperationProofSchema } from './originalOperationProof';
import { tableAccountRevision } from './tableAccountContract';
import { checkoutQuoteSchema, checkoutFingerprintSchema } from './checkoutQuoteResponse';
import { checkoutMoneySchema } from './checkoutMoney';

export const tableRoundIntentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  operationId: canonicalUuidSchema,
  tenantId: canonicalUuidSchema,
  serviceSessionId: canonicalUuidSchema,
  expectedAccountRevision: tableAccountRevision,
  expectedBasketId: canonicalUuidSchema,
  expectedPurchaseFingerprint: checkoutFingerprintSchema,
});
export type TableRoundIntent = z.infer<typeof tableRoundIntentSchema>;
export const tableRoundQuoteSchema = z.strictObject({
  ...checkoutQuoteSchema.shape,
  type: z.literal('DineIn'),
  availablePaymentMethods: z.tuple([]),
  money: z.strictObject({
    ...checkoutMoneySchema.shape,
    deliveryFee: z.literal(0),
    customerDiscount: z.literal(0),
    pointsDiscount: z.literal(0),
    pointsRedeemed: z.literal(0),
    tip: z.literal(0),
  }),
});
export const tableRoundPreparedSchema = z.strictObject({
  schemaVersion: z.literal(1),
  proof: originalOperationProofSchema,
  quote: tableRoundQuoteSchema,
  tableLabel: z.string().nullable(),
});
export type TableRoundPrepared = z.infer<typeof tableRoundPreparedSchema>;
export function bindPreparedTableRound(input: TableRoundIntent, currency: string, value: unknown) {
  const intent = tableRoundIntentSchema.parse(input);
  const prepared = tableRoundPreparedSchema.parse(value);
  if (
    prepared.proof.operationId !== intent.operationId ||
    prepared.proof.tenantId !== intent.tenantId ||
    prepared.quote.basketId !== intent.expectedBasketId ||
    prepared.quote.purchaseFingerprint !== intent.expectedPurchaseFingerprint ||
    prepared.quote.currency !== currency
  )
    throw new ApiFailure(200, 'contract');
  return prepared;
}
const resolutionScope = {
  schemaVersion: z.literal(1),
  operationId: canonicalUuidSchema,
  serviceSessionId: canonicalUuidSchema,
};
export const tableRoundResolutionSchema = z.discriminatedUnion('outcome', [
  z.strictObject({
    ...resolutionScope,
    outcome: z.literal('Applied'),
    orderId: canonicalUuidSchema,
  }),
  z.strictObject({ ...resolutionScope, outcome: z.literal('Unseen'), orderId: z.null() }),
  z.strictObject({ ...resolutionScope, outcome: z.literal('Cancelled'), orderId: z.null() }),
]);
export type TableRoundResolution = z.infer<typeof tableRoundResolutionSchema>;
export function bindTableRoundResolution(
  input: Pick<TableRoundIntent, 'operationId' | 'serviceSessionId'>,
  value: unknown,
  phase: 'submit' | 'recover' | 'cancel-attempt',
) {
  const result = tableRoundResolutionSchema.parse(value);
  if (
    result.operationId !== input.operationId ||
    result.serviceSessionId !== input.serviceSessionId ||
    (phase !== 'recover' && result.outcome === 'Unseen')
  )
    throw new ApiFailure(200, 'contract');
  return result;
}
