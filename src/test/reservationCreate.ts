import type { ReservationPreparation } from '../core/reservationOperationRecord';
import { SessionRepository } from '../core/sessionRepository';
import { TenantBoundary } from '../core/tenantContext';
import { fixtureDirectory, memorySecrets, tenantA } from './fixtures';
export const reservationOperationId = 'b59fe7ae-e4df-41bf-a3f9-c77340238446';
export const reservationResultId = '61551a98-bd65-43bd-b051-486a1648bb5b';
export function reservationJournalFixture(customer = false) {
  const store = memorySecrets();
  const repository = new SessionRepository(store);
  const boundary = new TenantBoundary(fixtureDirectory());
  const context = boundary.select(tenantA);
  const principal = customer
    ? { kind: 'customer' as const, id: reservationResultId }
    : { kind: 'guest' as const, id: 'bookings' };
  const prepared: ReservationPreparation = {
    environment: context.environment,
    tenantId: tenantA,
    principal,
    sessionId: '9289328c-83c7-4e85-a723-92bbb2d4bf1d',
    draft: {
      schemaVersion: 1,
      operationId: reservationOperationId,
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
    },
  };
  const proof = {
    schemaVersion: 1 as const,
    operationId: reservationOperationId,
    tenantId: tenantA,
    payloadHash: 'a'.repeat(64),
    ownerProof: 'opaque_server_proof-fixture',
  };
  const applied = {
    schemaVersion: 1 as const,
    operationId: reservationOperationId,
    outcome: 'Applied' as const,
    reservationId: reservationResultId,
  };
  const guard = jest.fn(() => {
    if (context.signal.aborted) throw new Error('Restaurant changed');
  });
  return { store, repository, boundary, context, principal, prepared, proof, applied, guard };
}
