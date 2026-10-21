import type { TableRoundIntent, TableRoundPrepared } from '../api/tableRoundContract';
import { checkoutQuote } from './checkoutQuote';
import { tenantA, tenantB } from './fixtures';

export function roundIntent(): TableRoundIntent {
  const quote = checkoutQuote();
  return {
    schemaVersion: 1,
    operationId: tenantB,
    tenantId: tenantA,
    serviceSessionId: tenantA,
    expectedAccountRevision: 7,
    expectedBasketId: quote.basketId,
    expectedPurchaseFingerprint: quote.purchaseFingerprint,
  };
}
export function preparedRound(): TableRoundPrepared {
  const intent = roundIntent();
  return {
    schemaVersion: 1,
    proof: {
      schemaVersion: 1,
      operationId: intent.operationId,
      tenantId: intent.tenantId,
      payloadHash: 'a'.repeat(64),
      ownerProof: 'protected-server-fixture',
    },
    tableLabel: 'Garden',
    quote: {
      ...checkoutQuote(),
      type: 'DineIn',
      availablePaymentMethods: [],
      money: {
        subTotal: 14,
        tax: 0,
        discount: 0,
        deliveryFee: 0,
        customerDiscount: 0,
        pointsDiscount: 0,
        pointsRedeemed: 0,
        tip: 0,
        total: 14,
      },
    },
  };
}
