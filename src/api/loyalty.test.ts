import {
  readLoyaltyBalance,
  readLoyaltyHistory,
  loyaltyBalanceSchema,
  loyaltyHistorySchema,
  loyaltyMovementSchema,
  loyaltyCursorFollows,
} from './loyalty';
import { loyaltyBalance, loyaltyMovement, loyaltyPage } from '../test/loyalty';
import { addressId } from '../test/savedAddresses';
import { sessionSetup } from '../test/sessions';
import { tenantA } from '../test/fixtures';
import { response } from '../test/transport';

it('reads recorded points using only the active customer and no guest credential', async () => {
  const f = await sessionSetup();
  f.fetcher.mockResolvedValue(response({ success: true, data: loyaltyBalance }));
  await expect(readLoyaltyBalance(f.controller, tenantA)).resolves.toEqual(loyaltyBalance);
  const [url, options] = f.fetcher.mock.calls[0]!;
  expect(url).toContain('/api/customer-mobile/loyalty/balance?schemaVersion=1');
  expect(options.method).toBe('GET');
  expect(options.headers?.Authorization).toBe('Bearer old-access');
  const guest = await sessionSetup(false);
  await expect(readLoyaltyBalance(guest.controller, tenantA)).rejects.toThrow();
  expect(guest.fetcher).not.toHaveBeenCalled();
});
it('preserves the seven-digit UTC sort cursor and refuses a row before that request cursor', async () => {
  const f = await sessionSetup();
  const { createdAt, transactionId } = loyaltyMovement();
  const cursor = { createdAt, transactionId };
  f.fetcher.mockResolvedValue(response({ success: true, data: loyaltyPage([loyaltyMovement(2)]) }));
  await readLoyaltyHistory(f.controller, tenantA, cursor);
  const query = new URL(f.fetcher.mock.calls[0]![0]).searchParams;
  expect(query.get('beforeCreatedAt')).toBe('2026-11-01T09:15:00.1234567Z');
  expect(query.get('beforeId')).toBe(transactionId);
  f.fetcher.mockResolvedValue(response({ success: true, data: loyaltyPage() }));
  await expect(readLoyaltyHistory(f.controller, tenantA, cursor)).rejects.toMatchObject({
    reason: 'contract',
  });
  await expect(
    readLoyaltyHistory(f.controller, tenantA, { ...cursor, createdAt: 'bad' }),
  ).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});
it('refuses financial promises, private fields, invalid balance bounds and unsupported schemas', () => {
  expect(
    loyaltyBalanceSchema.safeParse({
      schemaVersion: 1,
      currentPoints: 0,
      totalEarnedPoints: 0,
      totalRedeemedPoints: 0,
      lastUpdated: null,
    }).success,
  ).toBe(true);
  for (const patch of [
    { availablePoints: 99 },
    { currentPointsValue: 4.15 },
    { userId: addressId(3) },
    { currentPoints: -1 },
    { totalEarnedPoints: 2147483648 },
    { totalRedeemedPoints: 0.1 },
    { lastUpdated: null },
    { schemaVersion: 2 },
  ])
    expect(loyaltyBalanceSchema.safeParse({ ...loyaltyBalance, ...patch }).success).toBe(false);
  for (const patch of [
    { description: 'staff private' },
    { originalTransactionId: addressId(8) },
    { orderId: addressId(8) },
    { kind: 'FutureKind' },
    { createdAt: '2026-11-01' },
    { expiresAt: 'not-a-date' },
    { points: -2147483649 },
  ])
    expect(loyaltyMovementSchema.safeParse({ ...loyaltyMovement(), ...patch }).success).toBe(false);
});
it('requires a bounded unique ordered ledger and the exact last row for the continuation', () => {
  const items = Array.from({ length: 20 }, (_, index) => loyaltyMovement(index + 1));
  const next = { createdAt: items[19]!.createdAt, transactionId: items[19]!.transactionId };
  expect(loyaltyHistorySchema.safeParse({ ...loyaltyPage(items), next }).success).toBe(true);
  for (const page of [
    loyaltyPage([...items, loyaltyMovement(21)]),
    loyaltyPage([items[0]!, items[0]!]),
    loyaltyPage([...items].reverse()),
    { ...loyaltyPage(items.slice(1)), next },
    { ...loyaltyPage(items), next: { ...next, transactionId: addressId(21) } },
    { ...loyaltyPage(items), next: { ...next, createdAt: '2026-11-01T09:15:00.123456Z' } },
    { ...loyaltyPage(), schemaVersion: 2 },
  ])
    expect(loyaltyHistorySchema.safeParse(page).success).toBe(false);
  expect(loyaltyHistorySchema.safeParse(loyaltyPage([])).success).toBe(true);
});
it('compares exact UTC fractions and identifiers without truncating through JS Date', () => {
  const before = { createdAt: '2026-11-01T09:15:00.123456Z', transactionId: addressId(2) };
  expect(
    loyaltyCursorFollows({ ...before, createdAt: '2026-11-01T09:15:00.1234559Z' }, before),
  ).toBe(true);
  expect(
    loyaltyCursorFollows({ ...before, createdAt: '2026-11-01T09:15:00.1234561Z' }, before),
  ).toBe(false);
  expect(loyaltyCursorFollows({ ...before, transactionId: addressId(3) }, before)).toBe(true);
  expect(loyaltyCursorFollows(before, before)).toBe(false);
});
