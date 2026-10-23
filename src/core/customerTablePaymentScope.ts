import { readTablePaymentAccount } from '../api/tablePaymentAccount';
import { tablePaymentCurrency } from '../domain/tablePaymentMoney';
import { CustomerOperationScope } from './customerOperationScope';
import { readBootstrap } from '../api/bootstrap';
import { requireTableContributionEnabled } from './tableContributionPolicy';
import { canonicalUuidSchema } from './identifiers';
import { ApiFailure } from './apiFailure';
export abstract class CustomerTablePaymentScope extends CustomerOperationScope {
  assertStart() {
    this.assertCurrent();
    if (this.sessions.onlyRecoverOrders) throw new ApiFailure(409, 'refused');
    requireTableContributionEnabled(this.context, this.configuration, this.owner.principal);
  }
  async fresh(guard: () => void) {
    this.assertStart();
    guard();
    const bootstrap = await readBootstrap(this.client, this.context, guard);
    guard();
    requireTableContributionEnabled(this.context, bootstrap, this.owner.principal);
    if (bootstrap.currency !== this.configuration.currency) throw new ApiFailure(409, 'refused');
    return bootstrap;
  }
  protected async live(guard: () => void, expectedSession: string) {
    const bootstrap = await this.fresh(guard);
    const visit = await this.repository.tableVisits.read(this.context, this.owner.principal, guard);
    if (!visit || Date.parse(visit.identity.expiresAt) <= Date.now())
      throw new ApiFailure(409, 'refused');
    const sessionId = canonicalUuidSchema.parse(
      await this.repository.vault.capability(this.context, 'guest-session', this.owner.principal),
    );
    guard();
    if (sessionId !== expectedSession) throw new ApiFailure(409, 'refused');
    return { bootstrap, visit, sessionId };
  }
  protected async reviewAccount(locale: string, createId: () => string, guard: () => void) {
    const bootstrap = await this.fresh(guard);
    const principal = this.owner.principal;
    const visit = await this.repository.tableVisits.read(this.context, principal, guard);
    if (!visit) throw new ApiFailure(409, 'refused');
    const sessionId = await this.repository.tableVisits.paymentSession(
      this.context,
      visit,
      createId,
      guard,
    );
    const account = await readTablePaymentAccount(
      this.client,
      this.context,
      bootstrap,
      { visit, sessionId, currency: tablePaymentCurrency.parse(bootstrap.currency) },
      guard,
      locale,
    );
    guard();
    return { principal, bootstrap, visit, sessionId, account };
  }
}
