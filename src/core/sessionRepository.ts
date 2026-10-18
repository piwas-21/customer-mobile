import { z } from 'zod';
import { CredentialVault, type CustomerSession, type SecretStore } from './credentials';
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
  private readonly writes = new SerialTasks();
  constructor(private readonly store: SecretStore) {
    this.vault = new CredentialVault(store);
  }
  load(context: TenantContext): Promise<CustomerSession | null> {
    return this.writes.run(async () => {
      await this.completePendingRemoval(context);
      const id = await this.store.get(pointerKey(context));
      return id === null ? null : this.vault.session(context, z.uuid().parse(id));
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
  clear(context: TenantContext, expected: CustomerSession): Promise<boolean> {
    const captured = { ...expected };
    return this.writes.run(async () => {
      await this.completePendingRemoval(context);
      const current = await this.vault.session(context, captured.userId);
      if (current && !sameSession(current, captured)) return false;
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
      await this.vault.clear(context, { kind: 'customer', id: userId });
    }
    await this.store.remove(cleanupKey(context));
  }
}
