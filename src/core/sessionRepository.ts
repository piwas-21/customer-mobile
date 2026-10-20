import { ReservationOperationStorage } from './reservationOperationStorage';
import { ReservationOperationRepository } from './reservationOperationRepository';
import { CancellationOperationRepository } from './cancellationOperationRepository';
import { CancellationOperationStorage } from './cancellationOperationStorage';
import { PaymentAttentionStorage } from './paymentAttentionStorage';
import { scopedPaymentRecord } from './paymentOperationRecord';
import { scopedOrderDecisions } from './orderDecisions';
import { assertOrderProofScope, orderOperationProofSchema } from './orderOperationProof';
import { OrderOperationRepository } from './orderOperationRepository';
import { PaymentOperationRepository } from './paymentOperationRepository';
import { BasketOperationRepository } from './basketOperationRepository';
import { z } from 'zod';
import { CredentialVault, secretKey, type CustomerSession, type SecretStore } from './credentials';
import { SerialTasks } from './serialTasks';
import type { TenantContext } from './tenantContext';
const pointerKey = (context: TenantContext) =>
  `v2.${context.environment}.${context.tenant.id}.active-customer`;
const cleanupKey = (context: TenantContext) =>
  `v2.${context.environment}.${context.tenant.id}.customer-cleanup`;
const sameSession = (a: CustomerSession | null, b: CustomerSession) =>
  a?.userId === b.userId && a.accessToken === b.accessToken && a.refreshToken === b.refreshToken;
// One instance per installation serializes SecureStore changes across restaurant generations.
// Network requests do not hold this storage lock.
export class SessionRepository {
  readonly vault: CredentialVault;
  readonly baskets: BasketOperationRepository;
  readonly orders: OrderOperationRepository;
  readonly payments: PaymentOperationRepository;
  readonly cancellations: CancellationOperationRepository;
  readonly reservations: ReservationOperationRepository;
  private readonly writes = new SerialTasks();
  private readonly attention: PaymentAttentionStorage;
  constructor(private readonly store: SecretStore) {
    this.vault = new CredentialVault(store);
    this.attention = new PaymentAttentionStorage(store);
    this.baskets = new BasketOperationRepository(store, this.vault, this.writes);
    this.orders = new OrderOperationRepository(store, this.vault, this.writes);
    this.payments = new PaymentOperationRepository(store, this.writes);
    this.cancellations = new CancellationOperationRepository(store, this.writes);
    this.reservations = new ReservationOperationRepository(store, this.writes);
  }
  loadPaymentAttention(context: TenantContext): Promise<string | null> {
    return this.writes.run(() => this.attention.load(context));
  }
  dismissPaymentAttention(context: TenantContext): Promise<void> {
    return this.writes.run(() => this.attention.dismiss(context));
  }
  load(context: TenantContext): Promise<CustomerSession | null> {
    return this.writes.run(async () => {
      await this.completePendingRemoval(context);
      const id = await this.store.get(pointerKey(context));
      return id === null ? null : this.vault.session(context, z.uuid().parse(id));
    });
  }
  loadForOrderRecovery(context: TenantContext): Promise<CustomerSession | null> {
    return this.writes.run(async () => {
      await this.completePendingRemoval(context);
      const id = await this.store.get(pointerKey(context));
      if (id === null) return null;
      const principal = { kind: 'customer', id: z.uuid().parse(id) } as const;
      const raw = await this.store.get(secretKey(context, 'order-operation-proof', principal));
      if (raw !== null) {
        const proof = orderOperationProofSchema.parse(JSON.parse(raw));
        assertOrderProofScope(context, proof);
        if (proof.principal.kind !== principal.kind || proof.principal.id !== principal.id)
          throw new Error('Order recovery owner mismatch');
      } else {
        const saved = await this.store.get(secretKey(context, 'order-decisions', principal));
        const records = scopedOrderDecisions(
          context,
          principal,
          saved === null ? [] : JSON.parse(saved),
        );
        if (!records.some((record) => record.outcome === 'Applied')) {
          const payment = await this.store.get(secretKey(context, 'payment', principal));
          if (payment !== null) scopedPaymentRecord(context, principal, JSON.parse(payment));
          else {
            const cancellation = await new CancellationOperationStorage(this.store).read(
              context,
              principal,
              () => {},
            );
            const reservation = await new ReservationOperationStorage(this.store).read(
              context,
              principal,
              () => {},
            );
            if (cancellation?.resolution !== null && !reservation) return null;
          }
        }
      }
      // Account-disabled browsing reads a JWT only for its original order or reservation recovery.
      return this.vault.session(context, principal.id);
    });
  }
  activate(
    context: TenantContext,
    session: CustomerSession,
    isCurrent: () => boolean,
  ): Promise<void> {
    const captured = { ...session };
    return this.writes.run(async () => {
      const assertCurrent = () => {
        if (context.signal.aborted || !isCurrent()) throw new Error('Session operation changed');
      };
      assertCurrent();
      await this.completePendingRemoval(context);
      assertCurrent();
      z.uuid().parse(captured.userId);
      const previous = await this.vault.session(context, captured.userId);
      const pointer = await this.store.get(pointerKey(context));
      assertCurrent();
      try {
        await this.vault.saveSession(context, captured);
        assertCurrent();
        await this.store.set(pointerKey(context), captured.userId);
        assertCurrent();
      } catch (error) {
        const restored = await Promise.allSettled([
          previous
            ? this.vault.saveSession(context, previous)
            : this.vault.removeSession(context, captured.userId),
          pointer === null
            ? this.store.remove(pointerKey(context))
            : this.store.set(pointerKey(context), pointer),
        ]);
        if (restored.some((result) => result.status === 'rejected')) {
          // No later activation can enter this storage lock before quarantine finishes.
          // Even if credential restoration failed, a restart must not select the new pair.
          try {
            await this.store.set(cleanupKey(context), captured.userId);
          } finally {
            await this.store.remove(pointerKey(context));
          }
          throw new Error('Secure session update incomplete');
        }
        throw error;
      }
    });
  }
  clear(context: TenantContext, expected: CustomerSession, automatic = false): Promise<boolean> {
    const captured = { ...expected };
    return this.writes.run(async () => {
      await this.completePendingRemoval(context);
      const current = await this.vault.session(context, captured.userId);
      if (current && !sameSession(current, captured)) return false;
      if (automatic) await this.attention.retainPending(context, captured.userId);
      else await this.attention.retainCancellation(context, captured.userId);
      // Persist the cleanup identity before withdrawing selection. A restart must finish it.
      await this.store.set(cleanupKey(context), captured.userId);
      await this.completePendingRemoval(context);
      return true;
    });
  }
  private async completePendingRemoval(context: TenantContext): Promise<void> {
    const pending = await this.store.get(cleanupKey(context));
    if (pending === null) return;
    const userId = z.uuid().parse(pending);
    const pointer = await this.store.get(pointerKey(context));
    try {
      if (pointer === userId) await this.store.remove(pointerKey(context));
    } finally {
      const owner = { kind: 'customer', id: userId } as const;
      try {
        await new CancellationOperationStorage(this.store).clearResolvedForCleanup(context, owner);
      } finally {
        await this.vault.clear(context, owner);
      }
    }
    await this.store.remove(cleanupKey(context));
  }
}
