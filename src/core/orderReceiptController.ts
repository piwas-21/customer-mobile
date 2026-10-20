import { canonicalUuidSchema } from './identifiers';
import type { Principal } from './credentials';
import { CustomerOperationOwner } from './customerOperationOwner';
import type { SessionController } from './sessionController';
import type { SessionRepository } from './sessionRepository';
import type { TenantContext } from './tenantContext';
import { ApiFailure } from './transport';
export class OrderReceiptController {
  private readonly scope: CustomerOperationOwner;
  constructor(
    private readonly context: TenantContext,
    private readonly repository: SessionRepository,
    private readonly sessions: SessionController,
    principal: Principal,
  ) {
    this.scope = new CustomerOperationOwner(context, sessions, principal);
  }
  readonly assertCurrent = () => this.scope.assertCurrent();
  dispose() {
    this.scope.dispose();
  }
  async list() {
    this.assertCurrent();
    const records = await this.repository.orders.decisions(
      this.context,
      this.scope.principal,
      this.assertCurrent,
    );
    const unresolved = await this.repository.orders.hasUnresolvedPurchase(
      this.context,
      this.scope.principal,
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
      hasPending: unresolved,
      canContinueAsGuest:
        this.sessions.onlyRecoverOrders && this.scope.principal.kind === 'customer' && !unresolved,
    };
  }
  async read(operationId: string, locale: string) {
    canonicalUuidSchema.parse(operationId);
    this.assertCurrent();
    const records = await this.repository.orders.decisions(
      this.context,
      this.scope.principal,
      this.assertCurrent,
    );
    const saved = records.find(
      (value) => value.operationId === operationId && value.outcome === 'Applied',
    );
    if (!saved) throw new ApiFailure(404, 'refused');
    const result = await this.sessions.recovery.receipt(saved, locale);
    this.assertCurrent();
    return result;
  }
  async forget(operationId: string) {
    canonicalUuidSchema.parse(operationId);
    this.assertCurrent();
    const pending = await this.repository.orders.load(
      this.context,
      this.scope.principal,
      this.assertCurrent,
    );
    if (pending?.proof.operationId === operationId) throw new ApiFailure(409, 'refused');
    await this.repository.orders.forgetDecision(
      this.context,
      this.scope.principal,
      operationId,
      this.assertCurrent,
    );
    this.assertCurrent();
  }
  async continueAsGuest() {
    this.assertCurrent();
    if (!this.sessions.onlyRecoverOrders || this.scope.principal.kind !== 'customer')
      throw new ApiFailure(409, 'refused');
    if (
      await this.repository.orders.hasUnresolvedPurchase(
        this.context,
        this.scope.principal,
        this.assertCurrent,
      )
    )
      throw new ApiFailure(409, 'refused');
    this.assertCurrent();
    await this.sessions.logout();
  }
}
