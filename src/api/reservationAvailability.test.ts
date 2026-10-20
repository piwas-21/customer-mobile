import {
  availabilityInputSchema,
  readReservationAvailability,
  reservationAvailabilitySchema,
} from './reservationAvailability';
import { response, setup } from '../test/transport';
import { deferred } from '../test/deferred';
import { tenantB } from '../test/fixtures';
const input = { date: '2026-11-01', numberOfGuests: 2 };
const slot = { startTime: '18:30:00', endTime: '20:30:00' };
const page = () => ({ schemaVersion: 1, ...input, timeZone: 'America/Los_Angeles', slots: [slot] });

it('reads public availability with exact calendar input and no account or guest credentials', async () => {
  const f = setup();
  const credentials = jest.spyOn(f.vault, 'session');
  const capabilities = jest.spyOn(f.vault, 'capability');
  f.fetcher.mockResolvedValue(response({ success: true, data: page() }));
  await expect(
    readReservationAvailability(f.client, f.context, input, 'America/Los_Angeles'),
  ).resolves.toEqual(page());
  const [url, options] = f.fetcher.mock.calls[0]!;
  expect(new URL(url).searchParams.toString()).toBe(
    'schemaVersion=1&date=2026-11-01&numberOfGuests=2',
  );
  expect(options.method).toBe('GET');
  expect(options.headers).toEqual({ Accept: 'application/json' });
  expect(credentials).not.toHaveBeenCalled();
  expect(capabilities).not.toHaveBeenCalled();
});
it.each([
  { date: '2026-02-30' },
  { date: '2026-11-01T00:00:00Z' },
  { numberOfGuests: 0 },
  { numberOfGuests: 21 },
  { numberOfGuests: 1.5 },
])('refuses invalid input before I/O: %j', async (patch) => {
  const f = setup();
  await expect(
    readReservationAvailability(f.client, f.context, { ...input, ...patch }, 'America/Los_Angeles'),
  ).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
});
it.each([{ date: '2026-11-02' }, { numberOfGuests: 3 }, { timeZone: 'Europe/Zurich' }])(
  'refuses a successful response for a different request: %j',
  async (patch) => {
    const f = setup();
    f.fetcher.mockResolvedValue(response({ success: true, data: { ...page(), ...patch } }));
    await expect(
      readReservationAvailability(f.client, f.context, input, 'America/Los_Angeles'),
    ).rejects.toMatchObject({ reason: 'contract' });
  },
);
it('requires the exact narrow bounded slot projection and canonical wall times', () => {
  expect(availabilityInputSchema.parse({ ...input, numberOfGuests: 1 }).numberOfGuests).toBe(1);
  expect(availabilityInputSchema.parse({ ...input, numberOfGuests: 20 }).numberOfGuests).toBe(20);
  expect(reservationAvailabilitySchema.safeParse({ ...page(), slots: [] }).success).toBe(true);
  expect(
    reservationAvailabilitySchema.safeParse({
      ...page(),
      slots: [{ startTime: '22:00:00', endTime: '1.00:00:00' }],
    }).success,
  ).toBe(true);
  for (const patch of [
    { schemaVersion: 2 },
    { staff: true },
    { timeZone: 'bad' },
    { slots: [{ ...slot, tableId: tenantB }] },
    { slots: [slot, slot] },
    { slots: [{ startTime: '21:00:00', endTime: '22:00:00' }, slot] },
    { slots: [{ ...slot, startTime: '-00:00:00' }] },
    { slots: [{ ...slot, startTime: '0.18:30:00' }] },
    { slots: [{ ...slot, endTime: '1.00:00:01' }] },
    { slots: [{ ...slot, endTime: slot.startTime }] },
    {
      slots: Array.from({ length: 49 }, (_, index) => ({
        startTime: '00:' + String(index).padStart(2, '0') + ':00',
        endTime: '02:' + String(index).padStart(2, '0') + ':00',
      })),
    },
  ])
    expect(reservationAvailabilitySchema.safeParse({ ...page(), ...patch }).success).toBe(false);
});
it('accepts 48 distinct ordered slots and rejects a 49th otherwise valid slot', () => {
  const slots = Array.from({ length: 49 }, (_, index) => ({
    startTime: '00:' + String(index).padStart(2, '0') + ':00',
    endTime: '02:' + String(index).padStart(2, '0') + ':00',
  }));
  expect(
    reservationAvailabilitySchema.safeParse({ ...page(), slots: slots.slice(0, 48) }).success,
  ).toBe(true);
  expect(reservationAvailabilitySchema.safeParse({ ...page(), slots }).success).toBe(false);
});
it('refuses a late result after a real restaurant-boundary switch', async () => {
  const f = setup();
  const reply = deferred<Response>();
  const entered = deferred<void>();
  f.fetcher.mockImplementationOnce(() => {
    entered.resolve();
    return reply.promise;
  });
  const read = readReservationAvailability(f.client, f.context, input, 'America/Los_Angeles');
  await entered.promise;
  f.boundary.select(tenantB);
  reply.resolve(response({ success: true, data: page() }));
  await expect(read).rejects.toThrow();
});
