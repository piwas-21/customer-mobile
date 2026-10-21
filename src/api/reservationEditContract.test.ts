import { bindPreparedReservationEdit, reservationEditInputSchema } from './reservationEditContract';
import { tenantA, tenantB } from '../test/fixtures';
import { addressId } from '../test/savedAddresses';
const request = {
  schemaVersion: 1 as const,
  operationId: addressId(2),
  tenantId: tenantA,
  reservationId: addressId(1),
  timeZone: 'Europe/Zurich',
  date: '2030-05-17',
  startTime: '20:00:00',
  endTime: '22:00:00',
  numberOfGuests: 6,
  customerName: 'Changed customer',
  customerEmail: 'changed@example.test',
  customerPhone: '+41000000001',
  specialRequests: 'Changed request',
};
const original = {
  reservationId: addressId(1),
  reservationDate: '2030-05-17',
  startTime: '18:00:00',
  endTime: '20:00:00',
  numberOfGuests: 6,
  status: 'Confirmed',
  specialRequests: 'Previous request',
};
const review = () => ({
  schemaVersion: 1,
  proof: {
    schemaVersion: 1,
    operationId: addressId(2),
    tenantId: tenantA,
    payloadHash: 'a'.repeat(64),
    ownerProof: 'protected_editor_proof',
  },
  original,
  proposed: {
    reservationId: addressId(1),
    reservationDate: '2030-05-17',
    startTime: '20:00:00',
    endTime: '22:00:00',
    numberOfGuests: 6,
    status: 'Pending',
    specialRequests: 'Changed request',
  },
  timeZone: 'Europe/Zurich',
});
it('binds the independent original/proposed booking review and accepts equivalent TimeSpan precision', () => {
  expect(bindPreparedReservationEdit(request, review())).toEqual(review());
  expect(
    bindPreparedReservationEdit({ ...request, startTime: '20:00:00.0000000' }, review()),
  ).toEqual(review());
});
it.each([
  { schemaVersion: 2 },
  { timeZone: 'America/Los_Angeles' },
  { proof: { ...review().proof, operationId: addressId(3) } },
  { proof: { ...review().proof, tenantId: tenantB } },
  { original: { ...original, reservationId: addressId(3) } },
  { original: { ...original, status: 'Cancelled' } },
  { original: { ...original, customerEmail: 'private@example.test' } },
  { proposed: { ...review().proposed, reservationId: addressId(3) } },
  { proposed: { ...review().proposed, reservationDate: '2030-05-18' } },
  { proposed: { ...review().proposed, startTime: '20:30:00' } },
  { proposed: { ...review().proposed, endTime: '22:30:00' } },
  { proposed: { ...review().proposed, numberOfGuests: 5 } },
  { proposed: { ...review().proposed, specialRequests: null } },
  { proposed: { ...review().proposed, status: 'Confirmed' } },
  { proposed: { ...review().proposed, tableId: addressId(3) } },
  { proof: { ...review().proof, sessionId: addressId(3) } },
])('refuses changed review scope, proposal, status or private fields: %j', (patch) => {
  expect(() => bindPreparedReservationEdit(request, { ...review(), ...patch })).toThrow();
});
it.each(['Pending', 'Confirmed'] as const)(
  'preserves %s for contact-only proposals and refuses invented status changes',
  (status) => {
    const input = { ...request, startTime: '18:00:00', endTime: '20:00:00' };
    const contact = {
      ...review(),
      original: { ...original, status },
      proposed: { ...original, status, specialRequests: 'Changed request' },
    };
    expect(bindPreparedReservationEdit(input, contact)).toEqual(contact);
    expect(() =>
      bindPreparedReservationEdit(input, {
        ...contact,
        proposed: { ...contact.proposed, status: status === 'Confirmed' ? 'Pending' : 'Confirmed' },
      }),
    ).toThrow();
  },
);
it.each(['date', 'start', 'end', 'party'] as const)(
  'requires renewed approval after changing %s',
  (mode) => {
    const input = { ...request, startTime: '18:00:00', endTime: '20:00:00' };
    if (mode === 'date') input.date = '2030-05-18';
    if (mode === 'start') input.startTime = '18:30:00';
    if (mode === 'end') input.endTime = '21:00:00';
    if (mode === 'party') input.numberOfGuests = 5;
    const changed = {
      ...review(),
      proposed: {
        ...original,
        reservationDate: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        numberOfGuests: input.numberOfGuests,
        specialRequests: 'Changed request',
        status: 'Pending',
      },
    };
    expect(bindPreparedReservationEdit(input, changed)).toEqual(changed);
    expect(() =>
      bindPreparedReservationEdit(input, {
        ...changed,
        proposed: { ...changed.proposed, status: 'Confirmed' },
      }),
    ).toThrow();
  },
);
it.each([
  'schemaVersion',
  'operationId',
  'tenantId',
  'reservationId',
  'timeZone',
  'date',
  'startTime',
  'endTime',
  'numberOfGuests',
  'customerName',
  'customerEmail',
  'customerPhone',
  'specialRequests',
] as const)('requires explicit edit field %s and rejects caller authority fields', (field) => {
  const partial = { ...request };
  delete (partial as Partial<typeof partial>)[field];
  expect(reservationEditInputSchema.safeParse(partial).success).toBe(false);
  for (const extra of [
    { status: 'Confirmed' },
    { tableId: addressId(3) },
    { customerId: tenantA },
    { notes: 'Staff note' },
  ])
    expect(reservationEditInputSchema.safeParse({ ...request, ...extra }).success).toBe(false);
});
