import type { z } from 'zod';
import { signIn, refreshSession, type LoginInput } from '../api/auth';
import { ApiFailure, type CustomerTransport } from './transport';
import type { CustomerSession } from './credentials';
import type { TenantContext } from './tenantContext';
import type { SessionRepository } from './sessionRepository';
import { SerialTasks } from './serialTasks';
// One controller per immutable restaurant generation. Auth mutations serialize;
// reads remain parallel and logout withdraws secure selection without waiting on the network.
export class SessionController {
  private readonly tasks = new SerialTasks();
  private readonly listeners = new Set<() => void>();
  private revision = 0;
  private disposed = false;
  private session: CustomerSession | null = null;
  private pendingCleanup: CustomerSession | null = null;
  constructor(
    private readonly context: TenantContext,
    private readonly client: CustomerTransport,
    private readonly repository: SessionRepository,
  ) {}
  get userId(): string | null {
    return this.session?.userId ?? null;
  }
  get needsCleanup(): boolean {
    return this.pendingCleanup !== null;
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
  dispose(): void {
    this.disposed = true;
    ++this.revision;
    this.publish(null);
  }
  initialize(): Promise<string | null> {
    const revision = this.revision;
    return this.tasks.run(async () => {
      this.assertCurrent(revision);
      const session = await this.repository.load(this.context);
      this.assertCurrent(revision);
      this.publish(session);
      return this.userId;
    });
  }
  login(input: LoginInput, locale: string): Promise<string> {
    if (this.pendingCleanup) return Promise.reject(new ApiFailure(401, 'refused'));
    const revision = ++this.revision;
    const captured = { ...input };
    return this.tasks.run(async () => {
      this.assertCurrent(revision);
      const session = await signIn(this.client, this.context, captured, locale);
      this.assertCurrent(revision);
      await this.repository.activate(this.context, session, () => this.isCurrent(revision));
      this.assertCurrent(revision);
      this.publish(session);
      return session.userId;
    });
  }
  async logout(): Promise<void> {
    if (this.disposed) throw new ApiFailure(401, 'refused');
    ++this.revision;
    const captured = this.pendingCleanup ?? this.session;
    this.pendingCleanup = captured;
    this.publish(null);
    const session =
      captured ?? (this.context.signal.aborted ? null : await this.repository.load(this.context));
    if (!session) return;
    await this.clearSession(session);
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
  async get<T>(userId: string, path: string, schema: z.ZodType<T>): Promise<T> {
    const revision = this.revision;
    const captured = this.assertPrincipal(revision, userId);
    let result: T;
    try {
      result = await this.read(userId, path, schema);
    } catch (error) {
      if (!(error instanceof ApiFailure) || error.status !== 401) throw error;
      await this.tasks.run(async () => {
        const current = this.assertPrincipal(revision, userId);
        // Another concurrent read may already have rotated this exact session.
        if (current.accessToken === captured.accessToken) await this.refresh(revision);
      });
      result = await this.read(userId, path, schema);
    }
    this.assertPrincipal(revision, userId);
    return result;
  }
  private read<T>(userId: string, path: string, schema: z.ZodType<T>): Promise<T> {
    return this.client.request(this.context, path, schema, {
      credentials: 'customer',
      principal: { kind: 'customer', id: userId },
    });
  }
  private async refresh(revision: number): Promise<void> {
    this.assertCurrent(revision);
    const captured = this.session;
    if (!captured) throw new ApiFailure(401, 'refused');
    let next: CustomerSession;
    try {
      next = await refreshSession(this.client, this.context, captured);
    } catch (error) {
      this.assertCurrent(revision);
      if (error instanceof ApiFailure && error.status === 401) {
        await this.clearSession(captured);
      }
      throw error;
    }
    this.assertCurrent(revision);
    await this.repository.activate(this.context, next, () => this.isCurrent(revision));
    this.assertCurrent(revision);
    this.publish(next);
  }
}
