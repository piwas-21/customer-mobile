import {
  readReservationEditAvailability,
  readReservationEditContext,
  reservationEditAvailabilitySchema,
  reservationEditContextSchema,
} from './reservationEditReads';
import { reservationItem } from '../test/reservations';
import { addressId } from '../test/savedAddresses';
import { sessionSetup } from '../test/sessions';
import { tenantA, tenantB } from '../test/fixtures';
import { response } from '../test/transport';
import { deferred } from '../test/deferred';
const scope = { tenantId: tenantA, reservationId: addressId(1), timeZone: 'Europe/Zurich' };
const input = { date: '2026-11-01', numberOfGuests: 6 };
const contact = {
  customerName: 'Existing customer',
  customerEmail: 'old@example.test',
  customerPhone: null,
};
const context = () => ({
  schemaVersion: 1,
  tenantId: tenantA,
  timeZone: scope.timeZone,
  reservation: reservationItem(1, { status: 'Confirmed' }),
  contact,
});
const page = () => ({
  schemaVersion: 1,
  reservationId: scope.reservationId,
  ...input,
  timeZone: scope.timeZone,
  slots: [{ startTime: '18:30:00', endTime: '20:30:00' }],
});
it('reads private editor contact using current customer authority and the exact resource scope', async () => {
  const f = await sessionSetup();
  f.fetcher.mockResolvedValue(response({ success: true, data: context() }));
  await expect(readReservationEditContext(f.controller, tenantA, scope)).resolves.toEqual(
    context(),
  );
  const [url, options] = f.fetcher.mock.calls[0]!;
  expect(new URL(url).pathname).toBe(
    '/api/customer-mobile/reservations/' + scope.reservationId + '/edit',
  );
  expect(new URL(url).search).toBe('?schemaVersion=1');
  expect(options.method).toBe('GET');
  expect(options.headers?.Authorization).toBe('Bearer old-access');
});
it.each([
  { tenantId: tenantB },
  { timeZone: 'America/Los_Angeles' },
  { reservation: { ...reservationItem(), reservationId: addressId(2) } },
])('refuses an editor response with different original scope: %j', async (patch) => {
  const f = await sessionSetup();
  f.fetcher.mockResolvedValue(response({ success: true, data: { ...context(), ...patch } }));
  await expect(readReservationEditContext(f.controller, tenantA, scope)).rejects.toMatchObject({
    reason: 'contract',
  });
});
it('keeps existing private contact editable while rejecting extra staff, revision, table and credential fields', () => {
  expect(
    reservationEditContextSchema.safeParse({
      ...context(),
      contact: { ...contact, customerEmail: '' },
    }).success,
  ).toBe(true);
  for (const patch of [
    { schemaVersion: 2 },
    { customerEmail: 'extra@example.test' },
    { revision: addressId(9) },
    { contact: { ...contact, token: 'private' } },
    { contact: { ...contact, customerName: 'x'.repeat(101) } },
    { contact: { ...contact, customerEmail: 'x'.repeat(256) } },
    { contact: { ...contact, customerPhone: 'x'.repeat(21) } },
    { reservation: { ...context().reservation, status: 'Cancelled' } },
    { reservation: { ...context().reservation, status: 'FutureStatus' } },
    { reservation: { ...context().reservation, tableId: addressId(9) } },
  ])
    expect(reservationEditContextSchema.safeParse({ ...context(), ...patch }).success).toBe(false);
});
it('requests owned advisory slots with the booking, date, party and encoded restaurant zone', async () => {
  const f = await sessionSetup();
  f.fetcher.mockResolvedValue(response({ success: true, data: page() }));
  await expect(
    readReservationEditAvailability(f.controller, tenantA, scope, input),
  ).resolves.toEqual(page());
  const [url, options] = f.fetcher.mock.calls[0]!;
  const parsed = new URL(url);
  expect(parsed.pathname).toBe(
    '/api/customer-mobile/reservations/' + scope.reservationId + '/availability',
  );
  expect(Object.fromEntries(parsed.searchParams)).toEqual({
    schemaVersion: '1',
    date: input.date,
    numberOfGuests: '6',
    timeZone: scope.timeZone,
  });
  expect(options.headers?.Authorization).toBe('Bearer old-access');
  expect(options.method).toBe('GET');
});
it.each([
  { reservationId: addressId(2) },
  { date: '2026-11-02' },
  { numberOfGuests: 5 },
  { timeZone: 'America/Los_Angeles' },
])('refuses owned slots for a different original request: %j', async (patch) => {
  const f = await sessionSetup();
  f.fetcher.mockResolvedValue(response({ success: true, data: { ...page(), ...patch } }));
  await expect(
    readReservationEditAvailability(f.controller, tenantA, scope, input),
  ).rejects.toMatchObject({ reason: 'contract' });
});
it('preserves the shared ordered, unique, private-field-free 48-slot bound', () => {
  const slots = Array.from({ length: 49 }, (_, index) => ({
    startTime: '00:' + String(index).padStart(2, '0') + ':00',
    endTime: '02:' + String(index).padStart(2, '0') + ':00',
  }));
  expect(
    reservationEditAvailabilitySchema.safeParse({ ...page(), slots: slots.slice(0, 48) }).success,
  ).toBe(true);
  for (const patch of [
    { slots },
    { slots: [slots[0], slots[0]] },
    { slots: [slots[1], slots[0]] },
    { slots: [{ ...slots[0], tableId: addressId(9) }] },
    { slots: [{ startTime: '18:00:00', endTime: '17:00:00' }] },
    { slots: [{ startTime: '24:00:00', endTime: '1.00:00:01' }] },
    { contact },
    { notes: 'private' },
    { schemaVersion: 2 },
  ])
    expect(reservationEditAvailabilitySchema.safeParse({ ...page(), ...patch }).success).toBe(
      false,
    );
});
it.each(['context', 'availability'] as const)(
  'refuses invalid scope or input before %s transport',
  async (mode) => {
    const f = await sessionSetup();
    for (const patch of [
      { reservationId: 'invalid' },
      { tenantId: 'invalid' },
      { timeZone: 'invalid' },
    ]) {
      const read =
        mode === 'context'
          ? readReservationEditContext(f.controller, tenantA, { ...scope, ...patch })
          : readReservationEditAvailability(f.controller, tenantA, { ...scope, ...patch }, input);
      await expect(read).rejects.toThrow();
    }
    if (mode === 'availability') {
      for (const patch of [{ date: '2026-02-30' }, { numberOfGuests: 0 }, { numberOfGuests: 21 }])
        await expect(
          readReservationEditAvailability(f.controller, tenantA, scope, { ...input, ...patch }),
        ).rejects.toThrow();
    }
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
it.each(['context', 'availability'] as const)(
  'withdraws a late private %s result after logout',
  async (mode) => {
    const f = await sessionSetup();
    const reply = deferred<Response>();
    const entered = deferred<void>();
    f.fetcher.mockImplementationOnce(() => {
      entered.resolve();
      return reply.promise;
    });
    const read =
      mode === 'context'
        ? readReservationEditContext(f.controller, tenantA, scope)
        : readReservationEditAvailability(f.controller, tenantA, scope, input);
    await entered.promise;
    await f.controller.logout();
    reply.resolve(response({ success: true, data: mode === 'context' ? context() : page() }));
    await expect(read).rejects.toThrow();
  },
);
