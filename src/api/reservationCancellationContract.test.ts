import { reservationCancellationFixture } from '../test/reservationCancellation';
import {
  bindPreparedReservationCancellation,
  reservationCancellationInputSchema,
  reservationCancellationPreparedSchema,
} from './reservationCancellationContract';
import { reservationOperationRecordSchema } from '../core/reservationOperationRecord';
import { tenantB } from '../test/fixtures';
it('decodes the independent customer-only cancellation fixture with exact original booking and zone', async () => {
  const f = await reservationCancellationFixture();
  expect(bindPreparedReservationCancellation(f.prepared.request, f.cancellation)).toEqual(
    f.cancellation,
  );
  expect(reservationCancellationInputSchema.parse(f.prepared.request)).toEqual(f.prepared.request);
});
it.each([
  'schema',
  'operation',
  'tenant',
  'booking',
  'zone',
  'proof-schema',
  'proof-extra',
  'contact',
  'status',
  'table',
])('refuses an unbound or private cancellation preparation: %s', async (mode) => {
  const f = await reservationCancellationFixture();
  const original = f.cancellation;
  const value =
    mode === 'schema'
      ? { ...original, schemaVersion: 2 }
      : mode === 'operation'
        ? { ...original, proof: { ...original.proof, operationId: tenantB } }
        : mode === 'tenant'
          ? { ...original, proof: { ...original.proof, tenantId: tenantB } }
          : mode === 'booking'
            ? { ...original, reservation: { ...original.reservation, reservationId: tenantB } }
            : mode === 'zone'
              ? { ...original, timeZone: 'America/Los_Angeles' }
              : mode === 'proof-schema'
                ? { ...original, proof: { ...original.proof, schemaVersion: 2 } }
                : mode === 'proof-extra'
                  ? {
                      ...original,
                      proof: { ...original.proof, customerEmail: 'private@example.test' },
                    }
                  : mode === 'contact'
                    ? {
                        ...original,
                        reservation: {
                          ...original.reservation,
                          customerEmail: 'private@example.test',
                        },
                      }
                    : mode === 'status'
                      ? {
                          ...original,
                          reservation: { ...original.reservation, status: 'Cancelled' },
                        }
                      : { ...original, reservation: { ...original.reservation, tableId: tenantB } };
  expect(() => bindPreparedReservationCancellation(f.prepared.request, value)).toThrow();
});
it.each(['schemaVersion', 'operationId', 'tenantId', 'reservationId', 'timeZone'] as const)(
  'requires cancellation input field %s and refuses extra caller-owned status',
  async (field) => {
    const f = await reservationCancellationFixture();
    const input = { ...f.prepared.request };
    delete (input as Partial<typeof input>)[field];
    expect(reservationCancellationInputSchema.safeParse(input).success).toBe(false);
    expect(
      reservationCancellationInputSchema.safeParse({ ...f.prepared.request, status: 'Cancelled' })
        .success,
    ).toBe(false);
  },
);
it('keeps preparation snapshot distinct from the minimal stored original action descriptor', async () => {
  const f = await reservationCancellationFixture();
  const record = await f.install();
  expect(
    reservationOperationRecordSchema.safeParse({
      ...record,
      principal: { kind: 'guest', id: 'guest' },
    }).success,
  ).toBe(false);
  expect(
    reservationOperationRecordSchema.safeParse({
      ...record,
      resolution: { ...f.applied, reservationId: tenantB },
    }).success,
  ).toBe(false);
  expect(
    reservationOperationRecordSchema.safeParse({
      ...record,
      reservation: f.cancellation.reservation,
    }).success,
  ).toBe(false);
  expect(
    reservationCancellationPreparedSchema.safeParse({ ...f.cancellation, operatorNote: 'private' })
      .success,
  ).toBe(false);
});
