import { z } from 'zod';
import type { TenantContext } from './tenantContext';
export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
const identitySchema = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
export const credentialSecretSchema = z
  .string()
  .min(1)
  .max(16000)
  .regex(/^[\x21-\x7e]+$/);
export const principalSchema = z
  .object({ kind: z.enum(['customer', 'guest']), id: identitySchema })
  .strict();
export type Principal = Readonly<z.infer<typeof principalSchema>>;
const sessionSchema = z
  .object({
    userId: identitySchema,
    accessToken: credentialSecretSchema,
    refreshToken: credentialSecretSchema,
  })
  .strict();
export type CustomerSession = z.infer<typeof sessionSchema>;
export type CredentialKind =
  | 'session'
  | 'guest-session'
  | 'table-participant'
  | 'guest-order'
  | 'payment'
  | 'basket-operation'
  | 'order-operation-proof'
  | 'order-contact'
  | 'order-decisions';
export function secretKey(
  context: TenantContext,
  kind: CredentialKind,
  principal: Principal,
): string {
  const scoped = principalSchema.parse(principal);
  return `v2.${context.environment}.${context.tenant.id}.${scoped.kind}.${scoped.id}.${kind}`;
}
export class CredentialVault {
  constructor(private readonly store: SecretStore) {}
  async session(context: TenantContext, userId: string): Promise<CustomerSession | null> {
    const value = await this.store.get(
      secretKey(context, 'session', { kind: 'customer', id: userId }),
    );
    if (value === null) return null;
    const session = sessionSchema.parse(JSON.parse(value));
    if (session.userId !== userId) throw new Error('Credential identity mismatch');
    return session;
  }
  async saveSession(context: TenantContext, value: CustomerSession): Promise<void> {
    const session = sessionSchema.parse(value);
    await this.store.set(
      secretKey(context, 'session', { kind: 'customer', id: session.userId }),
      JSON.stringify(session),
    );
  }
  async removeSession(context: TenantContext, userId: string): Promise<void> {
    await this.store.remove(secretKey(context, 'session', { kind: 'customer', id: userId }));
  }
  orderReceiptRecords(context: TenantContext, principal: Principal): Promise<string | null> {
    return this.store.get(secretKey(context, 'order-decisions', principal));
  }
  async capability(
    context: TenantContext,
    kind: Exclude<
      CredentialKind,
      'session' | 'basket-operation' | 'order-contact' | 'order-decisions'
    >,
    principal: Principal,
  ): Promise<string | null> {
    const value = await this.store.get(secretKey(context, kind, principal));
    return value === null ? null : credentialSecretSchema.parse(value);
  }
  async saveCapability(
    context: TenantContext,
    kind: Exclude<
      CredentialKind,
      'session' | 'basket-operation' | 'order-contact' | 'order-decisions'
    >,
    principal: Principal,
    value: string,
  ): Promise<void> {
    await this.store.set(secretKey(context, kind, principal), credentialSecretSchema.parse(value));
  }
  async clear(context: TenantContext, principal: Principal): Promise<void> {
    const scoped = principalSchema.parse(principal);
    const kinds = [
      'session',
      'guest-session',
      'table-participant',
      'guest-order',
      'payment',
      'basket-operation',
      'order-contact',
      'order-decisions',
      // Keep the minimal order decision proof until explicit acceptance/cancellation recovery.
      // Contact, tokens and ordinary guest sessions are still purged on logout.
    ] as const;
    const removals = await Promise.allSettled(
      kinds.map((kind) => this.store.remove(secretKey(context, kind, scoped))),
    );
    if (removals.some((result) => result.status === 'rejected'))
      throw new Error('Credential removal incomplete');
  }
}
