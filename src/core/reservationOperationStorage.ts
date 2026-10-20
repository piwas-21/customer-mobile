import { secretKey, type Principal, type SecretStore } from './credentials';
import { removeAcknowledgedSecret, saveAcknowledgedSecret } from './acknowledgedSecret';
import {
  reservationContactSchema,
  scopedReservationRecord,
  type ReservationOperationRecord,
} from './reservationOperationRecord';
import type { ReservationDraft } from '../api/reservationCreateContract';
import type { TenantContext } from './tenantContext';
// Only SessionRepository's shared secure queue may call these methods. No network owns the queue.
export class ReservationOperationStorage {
  constructor(private readonly store: SecretStore) {}
  check(context: TenantContext, assertCurrent: () => void) {
    if (context.signal.aborted) throw new Error('Restaurant changed');
    assertCurrent();
  }
  async read(context: TenantContext, principal: Principal, assertCurrent: () => void) {
    this.check(context, assertCurrent);
    const raw = await this.store.get(secretKey(context, 'reservation-operation', principal));
    this.check(context, assertCurrent);
    return raw === null ? null : scopedReservationRecord(context, principal, JSON.parse(raw));
  }
  async intent(
    context: TenantContext,
    record: ReservationOperationRecord,
    assertCurrent: () => void,
  ) {
    scopedReservationRecord(context, record.principal, record);
    this.check(context, assertCurrent);
    const raw = await this.store.get(secretKey(context, 'reservation-contact', record.principal));
    this.check(context, assertCurrent);
    if (raw === null) return null; // Logout may purge contacts while keeping the minimal unresolved proof.
    const contact = reservationContactSchema.parse(JSON.parse(raw));
    if (
      contact.operationId !== record.proof.operationId ||
      contact.draft.tenantId !== record.tenantId
    )
      throw new Error('Reservation intent changed');
    return contact.draft;
  }
  async save(context: TenantContext, input: ReservationOperationRecord, assertCurrent: () => void) {
    const record = scopedReservationRecord(context, input.principal, input);
    this.check(context, assertCurrent);
    await saveAcknowledgedSecret(
      this.store,
      secretKey(context, 'reservation-operation', record.principal),
      JSON.stringify(record),
    );
    this.check(context, assertCurrent);
  }
  async saveIntent(
    context: TenantContext,
    principal: Principal,
    draft: ReservationDraft,
    assertCurrent: () => void,
  ) {
    const contact = reservationContactSchema.parse({ operationId: draft.operationId, draft });
    if (draft.tenantId !== context.tenant.id)
      throw new Error('Reservation intent restaurant changed');
    this.check(context, assertCurrent);
    await saveAcknowledgedSecret(
      this.store,
      secretKey(context, 'reservation-contact', principal),
      JSON.stringify(contact),
    );
    this.check(context, assertCurrent);
  }
  async removeContact(context: TenantContext, principal: Principal, assertCurrent: () => void) {
    this.check(context, assertCurrent);
    await removeAcknowledgedSecret(
      this.store,
      secretKey(context, 'reservation-contact', principal),
    );
    this.check(context, assertCurrent);
  }
  async removeProof(context: TenantContext, principal: Principal, assertCurrent: () => void) {
    this.check(context, assertCurrent);
    await removeAcknowledgedSecret(
      this.store,
      secretKey(context, 'reservation-operation', principal),
    );
    this.check(context, assertCurrent);
  }
}
