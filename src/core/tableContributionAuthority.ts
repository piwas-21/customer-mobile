import { CustomerOperationScope } from './customerOperationScope';
import { readBootstrap } from '../api/bootstrap';
import { readTablePaymentAccount } from '../api/tablePaymentAccount';
import { requireTableContributionEnabled } from './tableContributionPolicy';
import { scopedTablePaymentPreparation } from './tablePaymentPreparation';
import { canonicalUuidSchema } from './identifiers';
import { ApiFailure } from './apiFailure';
import type { TablePaymentRecord } from './tablePaymentRecord';
import { hostedPaymentPage } from './hostedPaymentPage';
import type { TableCheckoutDecision } from '../api/tableCheckoutDecision';
import { tablePaymentCurrency } from '../domain/tablePaymentMoney';
import type { TableVisitRecord } from './tableVisitRecord';
export class TableContributionAuthority extends CustomerOperationScope {
  assertStart() {
    this.assertCurrent();
    if (this.sessions.onlyRecoverOrders) throw new ApiFailure(409, 'refused');
    requireTableContributionEnabled(this.context, this.configuration, this.owner.principal);
  }
  load(guard = this.assertCurrent) {
    guard();
    return this.repository.tablePayments.load(this.context, this.owner.principal, guard);
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
  async page(
    record: TablePaymentRecord,
    decision: TableCheckoutDecision,
    origins: readonly string[],
  ) {
    if (
      record.cancellationRequested ||
      decision.outcome !== 'ready' ||
      !decision.checkoutUrl ||
      !decision.expiresAt
    )
      throw new ApiFailure(409, 'refused');
    await this.currentPreparation(record);
    return hostedPaymentPage(decision.checkoutUrl, decision.expiresAt, origins);
  }
  async currentPreparation(record: TablePaymentRecord) {
    if (record.cancellationRequested) throw new ApiFailure(409, 'refused');
    const live = await this.live(this.assertCurrent, record.sessionId);
    const preparation = this.originalPreparation(record, live.visit);
    const account = await readTablePaymentAccount(
      this.client,
      this.context,
      live.bootstrap,
      readScope(live, preparation.currency),
      this.assertCurrent,
      live.bootstrap.locale,
    );
    const bounds = account.account.limits.online;
    if (
      bounds?.currency !== record.review.currency ||
      record.review.amountMinor < bounds.minimumAmountMinor ||
      record.review.amountMinor > bounds.maximumAmountMinor
    )
      throw new ApiFailure(409, 'refused');
    const current = await this.load();
    if (JSON.stringify(current) !== JSON.stringify(record)) throw new ApiFailure(409, 'refused');
    const visit = await this.repository.tableVisits.read(
      this.context,
      record.principal,
      this.assertCurrent,
    );
    if (JSON.stringify(visit) !== JSON.stringify(live.visit)) throw new ApiFailure(409, 'refused');
    scopedTablePaymentPreparation(this.context, record.principal, preparation);
    return preparation;
  }
  protected originalPreparation(record: TablePaymentRecord, visit: TableVisitRecord) {
    if (this.configuration.currency !== record.review.currency)
      throw new ApiFailure(409, 'refused');
    return scopedTablePaymentPreparation(this.context, record.principal, {
      schemaVersion: 1,
      environment: record.environment,
      tenantId: record.tenantId,
      principal: record.principal,
      sessionId: record.sessionId,
      visit,
      intent: record.intent,
      currency: record.review.currency,
    });
  }
}
export function readScope(
  live: { sessionId: string; visit: TableVisitRecord },
  currency: string | null,
) {
  return {
    sessionId: live.sessionId,
    visit: live.visit,
    currency: tablePaymentCurrency.parse(currency),
  };
}
export function scopedCurrency(value: string | null) {
  return tablePaymentCurrency.parse(value);
}
