import { SessionWithdrawal } from './sessionWithdrawal';
import { renewStoredSession } from './sessionRenewal';
import { CustomerRecoveryReads, recoveryPrincipal } from './customerRecoveryReads';
import type { CustomerRecoveryAuthority } from './customerRecoveryReads';
import { readSession, retryAuthenticatedRead, writeSession } from './sessionRead';
import type { z } from 'zod';
import { signIn, type LoginInput } from '../api/auth';
import { ApiFailure, type CustomerTransport } from './transport';
import { principalSchema, type CustomerSession, type Principal } from './credentials';
import type { TenantContext } from './tenantContext';
import type { SessionRepository } from './sessionRepository';
import { SerialTasks } from './serialTasks';
export class SessionController {
  readonly recovery: CustomerRecoveryReads;
  private readonly tasks = new SerialTasks();
  private readonly listeners = new Set<() => void>();
  private revision = 0;
  private disposed = false;
  private session: CustomerSession | null = null;
  private readonly withdrawal: SessionWithdrawal;
  private initialized = false;
  private signingIn = false;
  constructor(
    private readonly context: TenantContext,
    private readonly client: CustomerTransport,
    private readonly repository: SessionRepository,
    private readonly accountsEnabled = true,
    private readonly recoveryOnly = false,
  ) {
    this.withdrawal = new SessionWithdrawal(context, repository, accountsEnabled);
    this.recovery = new CustomerRecoveryReads(context, client, (authority, read) => {
      const principal = recoveryPrincipal(authority);
      return principal.kind === 'customer'
        ? this.readOwned(principal.id, read, authority)
        : read(this.captureRequestOwner(principal));
    });
  }
  get onlyRecoverOrders(): boolean {
    return this.recoveryOnly || (!this.accountsEnabled && this.session !== null);
  }
  get userId(): string | null {
    return this.session?.userId ?? null;
  }
  get ownerVersion(): string {
    return `${this.revision}:${!this.signingIn && !this.withdrawal.pending && !this.needsPaymentAttention}`;
  }
  get needsPaymentAttention(): boolean {
    return this.withdrawal.attention !== null;
  }
  get needsCleanup(): boolean {
    return this.withdrawal.pending !== null;
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private publish(session: CustomerSession | null) {
    this.session = session;
    for (const listener of this.listeners) listener();
  }
  private isCurrent(revision: number): boolean {
    return !this.disposed && revision === this.revision && !this.context.signal.aborted;
  }
  private assertCurrent(revision: number): void {
    if (!this.isCurrent(revision)) throw new ApiFailure(401, 'refused');
  }
  private assertPrincipal(revision: number, userId: string): CustomerSession {
    this.assertCurrent(revision);
    if (this.session?.userId !== userId) throw new ApiFailure(401, 'refused');
    return this.session;
  }
  captureRequestOwner(principal: Principal): () => void {
    const owner = principalSchema.parse(principal);
    const revision = this.revision;
    const check = () => {
      this.assertCurrent(revision);
      if (!this.initialized || this.signingIn || this.withdrawal.pending)
        throw new ApiFailure(401, 'refused');
      if (owner.kind === 'customer') this.assertPrincipal(revision, owner.id);
      else if (this.session || this.needsPaymentAttention) throw new ApiFailure(401, 'refused');
    };
    check();
    return check;
  }
  dispose(): void {
    this.disposed = true;
    ++this.revision;
    this.publish(null);
  }
  initialize(): Promise<string | null> {
    const revision = this.revision;
    return this.tasks.run(async () => {
      this.assertCurrent(revision);
      const session = await (this.accountsEnabled
        ? this.repository.load(this.context)
        : this.repository.loadForOrderRecovery(this.context));
      this.assertCurrent(revision);
      await this.withdrawal.restore();
      this.assertCurrent(revision);
      this.initialized = true;
      this.publish(session);
      return this.userId;
    });
  }
  login(input: LoginInput, locale: string): Promise<string> {
    if (!this.accountsEnabled || this.onlyRecoverOrders || this.withdrawal.pending)
      return Promise.reject(new ApiFailure(401, 'refused'));
    const revision = ++this.revision;
    this.signingIn = true;
    this.publish(this.session);
    const captured = { ...input };
    return this.tasks
      .run(async () => {
        this.assertCurrent(revision);
        const session = await signIn(this.client, this.context, captured, locale);
        this.assertCurrent(revision);
        this.withdrawal.assertLoginOwner(session.userId);
        await this.repository.activate(this.context, session, () => this.isCurrent(revision));
        this.assertCurrent(revision);
        await this.withdrawal.dismiss();
        this.assertCurrent(revision);
        this.initialized = true;
        this.publish(session);
        return session.userId;
      })
      .finally(() => {
        if (this.isCurrent(revision)) {
          this.signingIn = false;
          this.publish(this.session);
        }
      });
  }
  async logout(): Promise<void> {
    if (this.disposed) throw new ApiFailure(401, 'refused');
    ++this.revision;
    this.signingIn = false;
    await this.withdrawal.logout(this.withdrawal.pending ?? this.session, () => this.publish(null));
  }
  async continueForAnotherCustomer(): Promise<void> {
    await this.logout();
    await this.withdrawal.dismiss();
    this.publish(null);
  }
  get<T>(userId: string, path: string, schema: z.ZodType<T>): Promise<T> {
    if (this.onlyRecoverOrders) return Promise.reject(new ApiFailure(401, 'refused'));
    return this.readOwned(userId, (guard) =>
      readSession(this.client, this.context, userId, path, schema, guard),
    );
  }
  private async readOwned<T>(
    userId: string,
    read: (guard: () => void) => Promise<T>,
    authority?: CustomerRecoveryAuthority,
  ): Promise<T> {
    const revision = this.revision;
    const captured = this.assertPrincipal(revision, userId);
    const guard = this.captureRequestOwner({ kind: 'customer', id: userId });
    const renew = () =>
      this.tasks.run(async () => {
        guard();
        if (this.session?.accessToken === captured.accessToken)
          await this.renew(revision, authority);
      });
    return retryAuthenticatedRead(() => read(guard), renew, guard);
  }
  async write<T>(
    userId: string,
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    locale: string,
    method: 'POST' | 'PUT' | 'DELETE' = 'PUT',
  ): Promise<T> {
    if (this.onlyRecoverOrders) throw new ApiFailure(401, 'refused');
    return writeSession(
      this.client,
      this.context,
      { userId, path, body, schema, locale, method },
      this.captureRequestOwner({ kind: 'customer', id: userId }),
    );
  }
  private async renew(revision: number, authority?: CustomerRecoveryAuthority): Promise<void> {
    const captured = this.session;
    if (!captured) throw new ApiFailure(401, 'refused');
    const next = await renewStoredSession(
      this.context,
      this.client,
      this.repository,
      captured,
      () => this.isCurrent(revision),
      () => this.withdrawal.clear(captured, () => this.publish(null), true),
      authority,
    );
    this.assertCurrent(revision);
    this.publish(next);
  }
}
