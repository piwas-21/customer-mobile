import {
  readReservationHistory,
  readReservation,
  reservationHistorySchema,
  reservationItemSchema,
  reservationCursorFollows,
} from './reservations';
import { reservationItem, reservationPage } from '../test/reservations';
import { addressId } from '../test/savedAddresses';
import { sessionSetup } from '../test/sessions';
import { tenantA } from '../test/fixtures';
import { response } from '../test/transport';

it('preserves exact UTC and TimeSpan cursor precision while keeping the calendar date unconverted', async () => {
  const f = await sessionSetup();
  const cursor = {
    reservationId: addressId(1),
    reservationDate: '2026-11-01T09:15:00.123456Z',
    startTime: '18:30:00.1234567',
  };
  f.fetcher.mockResolvedValue(
    response({ success: true, data: reservationPage([reservationItem(2)]) }),
  );
  const page = await readReservationHistory(f.controller, tenantA, cursor);
  expect(page.items[0]?.reservationDate).toBe('2026-11-01');
  const [url, options] = f.fetcher.mock.calls[0]!;
  const query = new URL(url).searchParams;
  expect(query.get('schemaVersion')).toBe('1');
  expect(query.get('beforeDate')).toBe(cursor.reservationDate);
  expect(query.get('beforeStartTime')).toBe(cursor.startTime);
  expect(query.get('beforeId')).toBe(cursor.reservationId);
  expect(options.headers?.Authorization).toBe('Bearer old-access');
  expect(options.method).toBe('GET');
});
it('reads only the requested detail and refuses malformed identifiers before transport', async () => {
  const f = await sessionSetup();
  f.fetcher.mockResolvedValue(response({ success: true, data: reservationItem() }));
  await expect(readReservation(f.controller, tenantA, addressId(1))).resolves.toEqual(
    reservationItem(),
  );
  expect(f.fetcher.mock.calls[0]?.[0]).toContain(
    '/api/customer-mobile/reservations/' + addressId(1) + '?schemaVersion=1',
  );
  await expect(readReservation(f.controller, tenantA, addressId(2))).rejects.toMatchObject({
    reason: 'contract',
  });
  await expect(readReservation(f.controller, tenantA, 'invalid')).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});
it('retains unknown statuses and rejects private fields, invalid days and unsupported envelopes', () => {
  expect(reservationItemSchema.parse(reservationItem(1, { status: 'FutureStatus' })).status).toBe(
    'FutureStatus',
  );
  for (const patch of [
    { customerEmail: 'private@example.test' },
    { notes: 'private' },
    { tableId: addressId(9) },
    { reservationDate: '2026-02-30' },
    { reservationDate: '2026-11-01T00:00:00Z' },
    { startTime: '18:30' },
    { startTime: '18:30:00.12345678' },
    { numberOfGuests: 0 },
    { specialRequests: 'x'.repeat(1001) },
  ])
    expect(reservationItemSchema.safeParse({ ...reservationItem(), ...patch }).success).toBe(false);
  for (const patch of [{ schemaVersion: 2 }, { timeZone: 'Not/AZone' }, { staff: true }])
    expect(reservationHistorySchema.safeParse({ ...reservationPage(), ...patch }).success).toBe(
      false,
    );
  expect(reservationHistorySchema.safeParse(reservationPage([])).success).toBe(true);
});
it('requires bounded unique rows and the exact last visible row for continuation without assuming midnight', () => {
  const items = Array.from({ length: 20 }, (_, index) => reservationItem(index + 1));
  const next = {
    reservationDate: '2026-11-01T09:15:00Z',
    startTime: '18:30:00',
    reservationId: addressId(20),
  };
  expect(reservationHistorySchema.safeParse(reservationPage(items, next)).success).toBe(true);
  for (const page of [
    reservationPage(items, { ...next, reservationId: addressId(21) }),
    reservationPage(items, { ...next, startTime: '19:30:00' }),
    reservationPage(items, { ...next, reservationDate: '2026-11-02T00:00:00Z' }),
    reservationPage(items.slice(1), next),
    reservationPage([...items, reservationItem(21)]),
    reservationPage([items[0]!, items[0]!]),
    reservationPage([reservationItem(), reservationItem(2, { reservationDate: '2026-11-02' })]),
  ])
    expect(reservationHistorySchema.safeParse(page).success).toBe(false);
});
it('compares exact sort markers, then wall durations, then canonical identifiers', () => {
  const cursor = {
    reservationDate: '2026-11-01T09:15:00.123456Z',
    startTime: '18:30:00',
    reservationId: addressId(1),
  };
  expect(reservationCursorFollows({ ...cursor, reservationId: addressId(2) }, cursor)).toBe(true);
  expect(reservationCursorFollows(cursor, cursor)).toBe(false);
  expect(
    reservationCursorFollows(
      { ...cursor, reservationDate: '2026-11-01T09:15:00.1234559Z' },
      cursor,
    ),
  ).toBe(true);
  expect(
    reservationCursorFollows(
      { ...cursor, reservationDate: '2026-11-01T09:15:00.1234561Z' },
      cursor,
    ),
  ).toBe(false);
  expect(reservationCursorFollows({ ...cursor, startTime: '18:30:00.0000001' }, cursor)).toBe(true);
  expect(reservationCursorFollows({ ...cursor, startTime: '18:29:59.9999999' }, cursor)).toBe(
    false,
  );
  expect(reservationCursorFollows({ ...cursor, startTime: '1.01:00:00' }, cursor)).toBe(true);
  expect(reservationCursorFollows({ ...cursor, startTime: '-00:00:01' }, cursor)).toBe(false);
});
it('rejects cursor regression or a later calendar day from a paged response', async () => {
  const f = await sessionSetup();
  const before = {
    reservationDate: '2026-11-01T09:15:00Z',
    startTime: '18:30:00',
    reservationId: addressId(20),
  };
  const items = Array.from({ length: 20 }, (_, index) => reservationItem(index + 1));
  f.fetcher.mockResolvedValue(response({ success: true, data: reservationPage(items, before) }));
  await expect(readReservationHistory(f.controller, tenantA, before)).rejects.toMatchObject({
    reason: 'contract',
  });
  f.fetcher.mockResolvedValue(
    response({
      success: true,
      data: reservationPage([reservationItem(21, { reservationDate: '2026-11-02' })]),
    }),
  );
  await expect(readReservationHistory(f.controller, tenantA, before)).rejects.toMatchObject({
    reason: 'contract',
  });
  await expect(
    readReservationHistory(f.controller, tenantA, { ...before, startTime: 'invalid' }),
  ).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});
