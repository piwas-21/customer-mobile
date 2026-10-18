import { z } from 'zod';
import type { TenantContext } from './tenantContext';
export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
const sessionSchema = z
  .object({
    userId: z.string().min(1),
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
  })
  .strict();
export type CustomerSession = z.infer<typeof sessionSchema>;
export type CredentialKind =
  'session' | 'guest-session' | 'table-participant' | 'guest-order' | 'payment';
export function secretKey(context: TenantContext, kind: CredentialKind): string {
  return `v1.${context.environment}.${context.tenant.id}.${kind}`;
}
export class CredentialVault {
  constructor(private readonly store: SecretStore) {}
  async session(context: TenantContext): Promise<CustomerSession | null> {
    const value = await this.store.get(secretKey(context, 'session'));
    return value ? sessionSchema.parse(JSON.parse(value)) : null;
  }
  async saveSession(context: TenantContext, value: CustomerSession): Promise<void> {
    await this.store.set(secretKey(context, 'session'), JSON.stringify(sessionSchema.parse(value)));
  }
  async capability(
    context: TenantContext,
    kind: Exclude<CredentialKind, 'session'>,
  ): Promise<string | null> {
    return this.store.get(secretKey(context, kind));
  }
  async saveCapability(
    context: TenantContext,
    kind: Exclude<CredentialKind, 'session'>,
    value: string,
  ): Promise<void> {
    if (!value || /[\r\n]/.test(value)) throw new Error('Invalid credential');
    await this.store.set(secretKey(context, kind), value);
  }
  async clear(context: TenantContext): Promise<void> {
    for (const kind of [
      'session',
      'guest-session',
      'table-participant',
      'guest-order',
      'payment',
    ] as const) {
      await this.store.remove(secretKey(context, kind));
    }
  }
}
