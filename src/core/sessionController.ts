import type { OrderOperationProof } from './orderOperationProof';
import { renewStoredSession } from './sessionRenewal';
import { readOrderReceipt } from '../api/orderReceipt';
import { decisionProof, orderDecisionSchema, type OrderDecision } from './orderDecisions';
import { readSession, retryAuthenticatedRead, writeSession } from './sessionRead';
import type { z } from 'zod';
import { signIn, type LoginInput } from '../api/auth';
import { ApiFailure, type CustomerTransport } from './transport';
import { principalSchema, type CustomerSession, type Principal } from './credentials';
import type { TenantContext } from './tenantContext';
import type { SessionRepository } from './sessionRepository';
import { SerialTasks } from './serialTasks';
export class SessionController {
  private readonly tasks = new SerialTasks();
  private readonly listeners = new Set<() => void>();
  private revision = 0;
  private disposed = false;
  private session: CustomerSession | null = null;
  private pendingCleanup: CustomerSession | null = null;
  private initialized = false;
  private signingIn = false;
  constructor(
    private readonly context: TenantContext,
    private readonly client: CustomerTransport,
    private readonly repository: SessionRepository,
    private readonly accountsEnabled = true,
    private readonly recoveryOnly = false,
  ) {}
  get onlyRecoverOrders(): boolean {
    return this.recoveryOnly || (!this.accountsEnabled && this.session !== null);
  }
  get userId(): string | null {
    return this.session?.userId ?? null;
  }
  get ownerVersion(): string {
    return `${this.revision}:${!this.signingIn && !this.pendingCleanup}`;
  }
  get needsCleanup(): boolean {
    return this.pendingCleanup !== null;
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
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
      if (!this.initialized || this.signingIn || this.pendingCleanup)
        throw new ApiFailure(401, 'refused');
      if (owner.kind === 'customer') this.assertPrincipal(revision, owner.id);
      else if (this.session) throw new ApiFailure(401, 'refused');
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
      this.initialized = true;
      this.publish(session);
      return this.userId;
    });
  }
  login(input: LoginInput, locale: string): Promise<string> {
    if (!this.accountsEnabled || this.onlyRecoverOrders || this.pendingCleanup)
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
        await this.repository.activate(this.context, session, () => this.isCurrent(revision));
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
    const captured = this.pendingCleanup ?? this.session;
    this.pendingCleanup = captured;
    this.publish(null);
    if (!this.accountsEnabled && !captured) return;
    const session =
      captured ?? (this.context.signal.aborted ? null : await this.repository.load(this.context));
    if (session) await this.clearSession(session);
  }
  private async clearSession(session: CustomerSession): Promise<void> {
    this.pendingCleanup = session;
    this.publish(null);
    const cleared = await this.repository.clear(this.context, session);
    if (!cleared && !this.context.signal.aborted)
      throw new Error('Secure session removal incomplete');
    this.pendingCleanup = null;
    this.publish(null);
  }
  get<T>(userId: string, path: string, schema: z.ZodType<T>): Promise<T> {
    if (this.onlyRecoverOrders) return Promise.reject(new ApiFailure(401, 'refused'));
    return this.readOwned(userId, (guard) =>
      readSession(this.client, this.context, userId, path, schema, guard),
    );
  }
  receipt(saved: OrderDecision, locale: string) {
    const decision = orderDecisionSchema.parse(saved);
    const read = (guard: () => void) =>
      readOrderReceipt(this.client, this.context, decision, guard, locale);
    if (decision.principal.kind === 'customer')
      return this.readOwned(decision.principal.id, read, decisionProof(decision));
    return read(this.captureRequestOwner(decision.principal));
  }
  private async readOwned<T>(
    userId: string,
    read: (guard: () => void) => Promise<T>,
    proof?: OrderOperationProof,
  ): Promise<T> {
    const revision = this.revision;
    const captured = this.assertPrincipal(revision, userId);
    const guard = this.captureRequestOwner({ kind: 'customer', id: userId });
    const renew = () =>
      this.tasks.run(async () => {
        guard();
        if (this.session?.accessToken === captured.accessToken) await this.refresh(revision, proof);
      });
    return retryAuthenticatedRead(() => read(guard), renew, guard);
  }
  async put<T>(
    userId: string,
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    locale: string,
  ): Promise<T> {
    if (this.onlyRecoverOrders) throw new ApiFailure(401, 'refused');
    return writeSession(
      this.client,
      this.context,
      { userId, path, body, schema, locale },
      this.captureRequestOwner({ kind: 'customer', id: userId }),
    );
  }
  private async refresh(revision: number, proof?: OrderOperationProof): Promise<void> {
    const captured = this.session;
    if (!captured) throw new ApiFailure(401, 'refused');
    const next = await renewStoredSession(
      this.context,
      this.client,
      this.repository,
      captured,
      () => this.isCurrent(revision),
      () => this.clearSession(captured),
      proof,
    );
    this.assertCurrent(revision);
    this.publish(next);
  }
}
