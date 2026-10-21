import { CustomerOperationScope } from './customerOperationScope';
import { readBasket } from '../api/basket';
import { readBootstrap } from '../api/bootstrap';
import { prepareTableRound, resolveTableRound } from '../api/tableRounds';
import { readTableAccount } from '../api/tableVisits';
import { tableRoundReview } from '../api/tableRoundReview';
import { canonicalUuidSchema } from './identifiers';
import { requireTableRoundEnabled } from './tableRoundPolicy';
import { tableRoundView } from './tableRoundView';
import type { TableRoundRecord } from './tableRoundRecord';
import type { TableRoundPreparation } from './tableRoundPreparation';
import type { SessionRepository } from './sessionRepository';
import { ApiFailure } from './transport';

export class TableRoundScope extends CustomerOperationScope {
  assertStart() {
    this.assertCurrent();
    if (this.sessions.onlyRecoverOrders) throw new ApiFailure(409, 'refused');
    requireTableRoundEnabled(this.context, this.configuration, this.owner.principal);
  }
  load(guard = this.assertCurrent) {
    guard();
    return this.repository.tableRounds.load(this.context, this.owner.principal, guard);
  }
  async fresh(guard: () => void) {
    this.assertStart();
    guard();
    const bootstrap = await readBootstrap(this.client, this.context, guard);
    guard();
    requireTableRoundEnabled(this.context, bootstrap, this.owner.principal);
    if (bootstrap.currency !== this.configuration.currency) throw new ApiFailure(409, 'refused');
    return bootstrap;
  }
  async prepare(locale: string, createId: () => string, guard: () => void) {
    const bootstrap = await this.fresh(guard);
    const principal = this.owner.principal;
    const visit = await this.repository.tableVisits.read(this.context, principal, guard);
    if (!visit) throw new ApiFailure(409, 'refused');
    const sessionId = canonicalUuidSchema.parse(
      await this.repository.vault.capability(this.context, 'guest-session', principal),
    );
    guard();
    const basket = await readBasket(this.client, this.context, principal, sessionId, guard, locale);
    const account = await readTableAccount(
      this.client,
      this.context,
      bootstrap,
      visit,
      guard,
      locale,
    );
    guard();
    const review = tableRoundReview(this.context, {
      principal,
      sessionId,
      visit,
      basket,
      account,
      bootstrap,
      operationId: createId(),
    });
    const response = await prepareTableRound(
      this.client,
      this.context,
      review.preparation,
      guard,
      locale,
    );
    guard();
    return { preparation: review.preparation, prepared: review.accept(response) };
  }
  async submit(record: TableRoundRecord, preparation: TableRoundPreparation, locale: string) {
    await this.fresh(this.assertCurrent);
    const result = await resolveTableRound(
      this.client,
      this.context,
      record,
      { phase: 'submit', preparation },
      this.assertCurrent,
      locale,
    );
    return this.finish(record, result);
  }
  async recover(record: TableRoundRecord, phase: 'recover' | 'cancel-attempt', locale: string) {
    this.assertCurrent();
    if (record.resolution) return tableRoundView(record);
    const result = await this.sessions.recovery.tableRound(
      record,
      phase,
      locale,
      this.assertCurrent,
    );
    return this.finish(record, result);
  }
  private async finish(
    record: TableRoundRecord,
    result: Parameters<SessionRepository['tableRounds']['finish']>[2],
  ) {
    const saved = await this.repository.tableRounds.finish(
      this.context,
      record,
      result,
      this.assertCurrent,
    );
    this.assertCurrent();
    return tableRoundView(saved);
  }
}
