import { addressId as id } from './savedAddresses';
export function loyaltyMovement(index = 1) {
  return {
    transactionId: id(index),
    kind: 'adjusted' as const,
    points: -index,
    createdAt: '2026-11-01T09:15:00.1234567Z',
    expiresAt: null,
  };
}
export function loyaltyPage(items = [loyaltyMovement()]) {
  return {
    schemaVersion: 1 as const,
    items,
    next: null as { createdAt: string; transactionId: string } | null,
  };
}
export const loyaltyBalance = {
  schemaVersion: 1,
  currentPoints: 415,
  totalEarnedPoints: 700,
  totalRedeemedPoints: 285,
  lastUpdated: '2026-11-01T09:15:00Z',
};
