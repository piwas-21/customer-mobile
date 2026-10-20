import { ApiFailure } from './transport';
import type { CustomerSession } from './credentials';
import type { SessionRepository } from './sessionRepository';
import type { TenantContext } from './tenantContext';
export class SessionWithdrawal {
  pending: CustomerSession | null = null;
  attention: string | null = null;
  private automatic = false;
  constructor(
    private readonly context: TenantContext,
    private readonly repository: SessionRepository,
    private readonly allowLoad: boolean,
  ) {}
  assertLoginOwner(userId: string): void {
    if (this.attention && this.attention !== userId) throw new ApiFailure(401, 'refused');
  }
  async restore(): Promise<void> {
    this.attention = await this.repository.loadPaymentAttention(this.context);
    this.automatic = this.attention !== null;
  }
  async dismiss(): Promise<void> {
    await this.repository.dismissPaymentAttention(this.context);
    this.attention = null;
    this.automatic = false;
  }
  async logout(captured: CustomerSession | null, publish: () => void): Promise<void> {
    this.pending = captured;
    publish();
    const session =
      captured ??
      (this.context.signal.aborted || !this.allowLoad
        ? null
        : await this.repository.load(this.context));
    if (session) await this.clear(session, publish);
    if (!this.automatic) await this.dismiss();
    publish();
  }
  async clear(session: CustomerSession, publish: () => void, automatic = false): Promise<void> {
    this.automatic ||= automatic;
    this.pending = session;
    publish();
    const cleared = await this.repository.clear(this.context, session, this.automatic);
    if (!cleared && !this.context.signal.aborted)
      throw new Error('Secure session removal incomplete');
    await this.restore();
    this.pending = null;
    publish();
  }
}
