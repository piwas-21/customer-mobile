import { tenantA, tenantB } from './fixtures';
import type { TableAccount } from '../api/tableAccountContract';
import type { TableAccountItem } from '../api/tableAccountItem';
export const tableIdentity = {
  serviceSessionId: tenantA,
  participantToken: 'A'.repeat(43),
  expiresAt: '2035-01-01T00:00:00.1234567Z',
};
export function tableItem(): TableAccountItem {
  return {
    itemId: 'da96aa10-cc71-481a-b282-9b4bdc535626',
    productName: 'Meal',
    variationName: null,
    quantity: 3,
    unitPrice: 3.33,
    itemTotal: 10,
    ingredientCustomizations: [{ name: 'Sauce', quantity: 1, removed: false, addOn: true }],
    sideItems: [],
  };
}
export function tableAccount(): TableAccount {
  const display = {
    orderId: tenantB,
    orderNumber: 'CREDIT-ROUND',
    dailyOrderNumber: 0,
    businessDate: '0001-01-01',
  };
  return {
    serviceSessionId: tenantA,
    tableLabel: 'Garden',
    currency: 'CHF',
    accountRevision: 7,
    subTotal: 15,
    tax: 0,
    discount: 0,
    tip: 0,
    total: 5,
    totalPaid: 2,
    remaining: 3,
    credit: 0,
    originalTotal: 15,
    billingCreditAmount: 10,
    orders: [
      {
        ...display,
        status: 'FutureUnknown',
        paymentStatus: 'PartiallyPaid',
        orderDate: '2026-11-01T12:00:00.1234567Z',
        total: 15,
        totalPaid: 2,
        remainingAmount: 3,
        payableTotal: 5,
        billingCreditAmount: 10,
      },
    ],
    items: [{ ...display, unitCount: 3, item: tableItem() }],
  };
}

export function tableVisitRecord() {
  return {
    schemaVersion: 1 as const,
    environment: 'staging' as const,
    tenantId: tenantA,
    principal: { kind: 'guest' as const, id: 'basket' },
    identity: { ...tableIdentity },
  };
}
