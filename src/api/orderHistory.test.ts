import { orderHistorySchema, readOrderHistory } from './orderHistory';
import { historyItem, historyPage } from '../test/orderHistory';
import { sessionSetup } from '../test/sessions';
import { response } from '../test/transport';
import { tenantA } from '../test/fixtures';
import { addressId } from '../test/savedAddresses';
it('reads bounded private history with the exact UTC precision and both cursor fields', async () => {
  const f = await sessionSetup();
  const before = { orderId: addressId(1), orderDate: '2026-10-19T12:00:00.123456Z' };
  f.fetcher.mockResolvedValue(
    response({
      success: true,
      data: historyPage([historyItem(2, { orderDate: '2026-10-19T12:00:00.123455Z' })]),
    }),
  );
  await expect(readOrderHistory(f.controller, tenantA, before)).resolves.toMatchObject({
    items: [expect.objectContaining({ orderId: addressId(2) })],
  });
  const [url, options] = f.fetcher.mock.calls[0]!;
  const query = new URL(url).searchParams;
  expect(query.get('schemaVersion')).toBe('1');
  expect(query.get('beforeOrderDate')).toBe('2026-10-19T12:00:00.123456Z');
  expect(query.get('beforeOrderId')).toBe(addressId(1));
  expect(options.headers?.Authorization).toBe('Bearer old-access');
  expect(options.method).toBe('GET');
});
it('accepts legacy missing currency and future statuses without inventing a price or paid state', () => {
  const page = historyPage([
    historyItem(1, {
      currency: null,
      payableTotal: null,
      status: 'FutureStatus',
      paymentStatus: 'UnknownPayment',
    }),
  ]);
  expect(orderHistorySchema.parse(page)).toEqual(page);
  expect(orderHistorySchema.safeParse(historyPage([]))).toMatchObject({ success: true });
});
it('validates deterministic ties and normalizes fractional precision for ordering without discarding microseconds', () => {
  const items = [
    historyItem(1, { orderDate: '2026-10-19T12:00:00.123456Z' }),
    historyItem(2, { orderDate: '2026-10-19T12:00:00.123455Z' }),
    historyItem(3, { orderDate: '2026-10-19T12:00:00Z' }),
    historyItem(4, { orderDate: '2026-10-19T12:00:00.0000000Z' }),
  ];
  expect(orderHistorySchema.safeParse(historyPage(items)).success).toBe(true);
  expect(orderHistorySchema.safeParse(historyPage([items[1]!, items[0]!])).success).toBe(false);
});
it('accepts a full page only with its exact last-item continuation and refuses duplicated, reversed or extra rows', () => {
  const items = Array.from({ length: 20 }, (_, index) => historyItem(index + 1));
  const next = { orderDate: items[19]!.orderDate, orderId: items[19]!.orderId };
  expect(orderHistorySchema.safeParse(historyPage(items, next)).success).toBe(true);
  for (const page of [
    historyPage(items, { ...next, orderId: addressId(21) }),
    historyPage(items.slice(1), next),
    historyPage([...items, historyItem(21)]),
    historyPage([items[0]!, items[0]!]),
    historyPage([...items].reverse()),
  ])
    expect(orderHistorySchema.safeParse(page).success).toBe(false);
});
it.each([
  { currency: null, payableTotal: 18 },
  { currency: 'CHF', payableTotal: null },
  { payableTotal: -1 },
  { payableTotal: 18.001 },
  { currency: 'invalid' },
  { orderId: 'invalid' },
  { orderDate: 'not-a-date' },
  { orderDate: '2026-10-19T12:00:00.12345678Z' },
  { orderDate: '2026-10-19T12:00:00+02:00' },
  { customerEmail: 'private@example.test' },
])('refuses unsupported or contradictory history fields %j', (patch) => {
  expect(orderHistorySchema.safeParse(historyPage([{ ...historyItem(), ...patch }])).success).toBe(
    false,
  );
});
it.each([{ schemaVersion: 2 }, { businessTimeZoneId: 'Not/AZone' }, { privateMetadata: true }])(
  'refuses unsupported envelopes %j',
  (patch) =>
    expect(orderHistorySchema.safeParse({ ...historyPage(), ...patch }).success).toBe(false),
);
it('rejects cursor regression and malformed cursor navigation without exposing a successful private page', async () => {
  const f = await sessionSetup();
  const before = { orderId: addressId(2), orderDate: '2026-10-19T12:00:00Z' };
  f.fetcher.mockResolvedValue(response({ success: true, data: historyPage([historyItem(1)]) }));
  await expect(readOrderHistory(f.controller, tenantA, before)).rejects.toMatchObject({
    reason: 'contract',
  });
  await expect(
    readOrderHistory(f.controller, tenantA, { ...before, orderId: 'invalid' }),
  ).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
