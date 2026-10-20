import {
  bindPreparedReservation,
  bindReservationResolution,
  reservationCreateProofSchema,
  reservationCreateResolutionSchema,
  reservationDraftSchema,
} from './reservationCreateContract';
import { tenantA, tenantB } from '../test/fixtures';
const operationId = 'b59fe7ae-e4df-41bf-a3f9-c77340238446';
const reservationId = '61551a98-bd65-43bd-b051-486a1648bb5b';
const draft = {
  schemaVersion: 1,
  operationId,
  tenantId: tenantA,
  timeZone: 'Europe/Zurich',
  date: '2030-05-17',
  startTime: '18:00:00',
  endTime: '20:00:00',
  numberOfGuests: 6,
  customerName: 'Native guest',
  customerEmail: 'guest@example.test',
  customerPhone: null,
  specialRequests: 'Customer request',
} as const;
const proof = {
  schemaVersion: 1,
  operationId,
  tenantId: tenantA,
  payloadHash: 'a'.repeat(64),
  ownerProof: 'opaque_server_proof-fixture',
} as const;
const applied = { schemaVersion: 1, operationId, outcome: 'Applied', reservationId } as const;
it('separates private draft from strict minimal recovery proof and preserves exact wall time precision', () => {
  expect(reservationDraftSchema.parse(draft)).toEqual(draft);
  expect(reservationDraftSchema.parse({ ...draft, startTime: '18:00:00.1234567' }).startTime).toBe(
    '18:00:00.1234567',
  );
  expect(
    reservationDraftSchema.parse({ ...draft, startTime: '22:00:00', endTime: '1.00:00:00' })
      .endTime,
  ).toBe('1.00:00:00');
  expect(bindPreparedReservation(draft, proof)).toEqual(proof);
  expect(
    reservationCreateProofSchema.safeParse({ ...proof, customerEmail: draft.customerEmail })
      .success,
  ).toBe(false);
});
it.each([
  { schemaVersion: 2 },
  { operationId: '00000000-0000-0000-0000-000000000000' },
  { tenantId: '' },
  { timeZone: 'invalid' },
  { date: '2030-02-30' },
  { date: '2030-05-17T00:00:00Z' },
  { startTime: '20:00:00' },
  { startTime: '-01:00:00' },
  { endTime: '1.00:00:01' },
  { numberOfGuests: 0 },
  { numberOfGuests: 21 },
  { numberOfGuests: 1.5 },
  { customerName: '   ' },
  { customerName: 'n'.repeat(101) },
  { customerEmail: 'invalid' },
  { customerPhone: '1'.repeat(21) },
  { specialRequests: 'n'.repeat(1001) },
  { status: 'Confirmed' },
  { tableId: reservationId },
  { customerId: reservationId },
  { payloadHash: proof.payloadHash },
])('refuses malformed or staff-authority draft input: %j', (patch) => {
  expect(reservationDraftSchema.safeParse({ ...draft, ...patch }).success).toBe(false);
});
it.each([
  { schemaVersion: 2 },
  { payloadHash: 'A'.repeat(64) },
  { payloadHash: 'a'.repeat(63) },
  { ownerProof: '' },
  { ownerProof: 'a'.repeat(4097) },
  { ownerProof: 'token with spaces' },
  { sessionId: reservationId },
  { customerPhone: null },
])('refuses incomplete or expanded minimal proof: %j', (patch) => {
  expect(reservationCreateProofSchema.safeParse({ ...proof, ...patch }).success).toBe(false);
});
it.each([{ operationId: reservationId }, { tenantId: tenantB }])(
  'refuses prepared proof from another operation or restaurant: %j',
  (patch) => expect(() => bindPreparedReservation(draft, { ...proof, ...patch })).toThrow(),
);
it('permits stable terminal decisions for every phase and allows Unseen only for read-only recovery', () => {
  const cancelled = { ...applied, outcome: 'Cancelled', reservationId: null };
  const unseen = { ...applied, outcome: 'Unseen', reservationId: null };
  for (const phase of ['create', 'recover', 'cancel-attempt'] as const) {
    expect(bindReservationResolution(proof, applied, phase)).toEqual(applied);
    expect(bindReservationResolution(proof, cancelled, phase)).toEqual(cancelled);
    expect(() =>
      bindReservationResolution(proof, { ...applied, operationId: reservationId }, phase),
    ).toThrow();
  }
  expect(bindReservationResolution(proof, unseen, 'recover')).toEqual(unseen);
  expect(() => bindReservationResolution(proof, unseen, 'create')).toThrow();
  expect(() => bindReservationResolution(proof, unseen, 'cancel-attempt')).toThrow();
});
it.each([
  { schemaVersion: 2 },
  { outcome: 'Confirmed' },
  { reservationId: null },
  { reservationId: '00000000-0000-0000-0000-000000000000' },
  { outcome: 'Cancelled' },
  { outcome: 'Unseen' },
  { customerEmail: draft.customerEmail },
])('refuses inconsistent or expanded server resolutions: %j', (patch) => {
  expect(reservationCreateResolutionSchema.safeParse({ ...applied, ...patch }).success).toBe(false);
});
