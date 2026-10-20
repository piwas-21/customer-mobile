import { canonicalUuidSchema } from './identifiers';
import { principalSchema, type Principal } from './credentials';
import type { SessionController } from './sessionController';
import type { SessionRepository } from './sessionRepository';
import type { TenantContext } from './tenantContext';
import { ApiFailure } from './transport';
export class OrderReceiptController {
  private readonly principal: Principal;
  private readonly owner: () => void;
  private disposed = false;
  constructor(
    private readonly context: TenantContext,
    private readonly repository: SessionRepository,
    private readonly sessions: SessionController,
    principal: Principal,
  ) {
    this.principal = Object.freeze(principalSchema.parse(principal));
    this.owner = sessions.captureRequestOwner(this.principal);
  }
  readonly assertCurrent = () => {
    if (this.disposed || this.context.signal.aborted) throw new ApiFailure(0, 'refused');
    this.owner();
  };
  dispose() {
    this.disposed = true;
  }
  async list() {
    this.assertCurrent();
    const records = await this.repository.orders.decisions(
      this.context,
      this.principal,
      this.assertCurrent,
    );
    const pending = await this.repository.orders.load(
      this.context,
      this.principal,
      this.assertCurrent,
    );
    this.assertCurrent();
    return {
      items: records
        .map((value) => ({
          operationId: value.operationId,
          orderId: value.orderId,
          outcome: value.outcome,
          recordedAt: value.recordedAt ?? null,
        }))
        .reverse(),
      hasPending: pending !== null,
      canContinueAsGuest:
        this.sessions.onlyRecoverOrders && this.principal.kind === 'customer' && pending === null,
    };
  }
  async read(operationId: string, locale: string) {
    canonicalUuidSchema.parse(operationId);
    this.assertCurrent();
    const records = await this.repository.orders.decisions(
      this.context,
      this.principal,
      this.assertCurrent,
    );
    const saved = records.find(
      (value) => value.operationId === operationId && value.outcome === 'Applied',
    );
    if (!saved) throw new ApiFailure(404, 'refused');
    const result = await this.sessions.orders.receipt(saved, locale);
    this.assertCurrent();
    return result;
  }
  async forget(operationId: string) {
    canonicalUuidSchema.parse(operationId);
    this.assertCurrent();
    const pending = await this.repository.orders.load(
      this.context,
      this.principal,
      this.assertCurrent,
    );
    if (pending?.proof.operationId === operationId) throw new ApiFailure(409, 'refused');
    await this.repository.orders.forgetDecision(
      this.context,
      this.principal,
      operationId,
      this.assertCurrent,
    );
    this.assertCurrent();
  }
  async continueAsGuest() {
    this.assertCurrent();
    if (!this.sessions.onlyRecoverOrders || this.principal.kind !== 'customer')
      throw new ApiFailure(409, 'refused');
    if (await this.repository.orders.load(this.context, this.principal, this.assertCurrent))
      throw new ApiFailure(409, 'refused');
    this.assertCurrent();
    await this.sessions.logout();
  }
}
