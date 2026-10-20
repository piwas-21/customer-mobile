import type { Principal } from './credentials';
import { CustomerOperationOwner } from './customerOperationOwner';
import type { SessionController } from './sessionController';
import type { SessionRepository } from './sessionRepository';
import type { TenantContext } from './tenantContext';
import type { PaymentOperationRecord } from './paymentOperationRecord';
import type { CustomerPaymentDecision } from '../api/customerPaymentDecision';
import { hostedPaymentPage } from './hostedPaymentPage';
import { SingleOperation } from './singleOperation';
import { ApiFailure } from './transport';
type Resolution = { record: PaymentOperationRecord; decision: CustomerPaymentDecision };
export type PaymentView = {
  operationId: string;
  orderId: string;
  state: PaymentOperationRecord['state'];
  canOpen: boolean;
};
export class CustomerPaymentController {
  private readonly scope: CustomerOperationOwner;
  private readonly origins: readonly string[];
  private readonly checks = new SingleOperation<Resolution | null>();
  private readonly browser = new SingleOperation<PaymentView | null>();
  constructor(
    private readonly context: TenantContext,
    private readonly repository: SessionRepository,
    private readonly sessions: SessionController,
    principal: Principal,
    approvedOrigins: readonly string[],
    private readonly openBrowser: (url: string) => Promise<unknown>,
  ) {
    this.scope = new CustomerOperationOwner(context, sessions, principal);
    this.origins = Object.freeze([...approvedOrigins]);
  }
  readonly assertCurrent = () => this.scope.assertCurrent();
  dispose() {
    this.scope.dispose();
  }
  async saved(): Promise<PaymentView | null> {
    const record = await this.load();
    return record ? this.view(record, false) : null;
  }
  async recover(locale: string): Promise<PaymentView | null> {
    return this.present(await this.check(locale));
  }
  open(locale: string): Promise<PaymentView | null> {
    this.assertCurrent();
    return this.browser.run('open', async () => {
      const resolved = await this.check(locale);
      if (resolved?.decision.outcome !== 'ready') return this.present(resolved);
      const page = this.page(resolved.decision);
      this.assertCurrent();
      try {
        // The original proof and pending decision have already been durably acknowledged.
        await this.openBrowser(page);
      } finally {
        // Browser dismissal, claimed success and verified links are navigation only.
        // Recover the same operation even when browser launch itself fails.
        this.assertCurrent();
        await this.check(locale);
      }
      return this.saved();
    });
  }
  private async load() {
    this.assertCurrent();
    return this.repository.payments.load(this.context, this.scope.principal, this.assertCurrent);
  }
  private check(locale: string) {
    this.assertCurrent();
    return this.checks.run('recover', async () => {
      const saved = await this.load();
      if (!saved) return null;
      const decision = await this.sessions.recovery.payment(saved, locale);
      this.assertCurrent();
      const record = await this.repository.payments.resolve(
        this.context,
        saved,
        decision,
        this.assertCurrent,
      );
      this.assertCurrent();
      return { record, decision };
    });
  }
  private page(decision: CustomerPaymentDecision) {
    if (decision.outcome !== 'ready' || decision.checkoutUrl === null)
      throw new ApiFailure(409, 'refused');
    return hostedPaymentPage(decision.checkoutUrl, decision.expiresAt, this.origins);
  }
  private present(resolved: Resolution | null): PaymentView | null {
    if (!resolved) return null;
    let canOpen = false;
    if (resolved.decision.outcome === 'ready') {
      try {
        this.page(resolved.decision);
        canOpen = true;
      } catch {
        // Invalid or locally expired URLs cannot change the server's financial decision.
      }
    }
    return this.view(resolved.record, canOpen);
  }
  private view(record: PaymentOperationRecord, canOpen: boolean): PaymentView {
    return {
      operationId: record.proof.operationId,
      orderId: record.orderId,
      state: record.state,
      canOpen,
    };
  }
}
