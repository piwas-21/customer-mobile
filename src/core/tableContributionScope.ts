import {
  TableContributionAuthority,
  readScope,
  scopedCurrency,
} from './tableContributionAuthority';
import { readTablePaymentAccount } from '../api/tablePaymentAccount';
import {
  prepareTableContribution,
  resolveTableContribution,
  resolveTableCheckout,
} from '../api/tableContributions';
import { tableContributionReview } from '../api/tableContributionReview';
import {
  tableContributionChoiceSchema,
  type TableContributionChoice,
} from '../domain/tableContributionSelection';
import { ApiFailure } from './apiFailure';
import { tablePaymentResolved, type TablePaymentRecord } from './tablePaymentRecord';
export type TableContributionCandidate = Awaited<ReturnType<TableContributionScope['prepare']>>;
export class TableContributionScope extends TableContributionAuthority {
  async prepare(
    value: TableContributionChoice,
    createId: () => string,
    locale: string,
    guard: () => void,
  ) {
    const choice = tableContributionChoiceSchema.parse(value);
    const bootstrap = await this.fresh(guard);
    const visit = await this.repository.tableVisits.read(this.context, this.owner.principal, guard);
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
      { visit, sessionId, currency: scopedCurrency(bootstrap.currency) },
      guard,
      locale,
    );
    const review = tableContributionReview(this.context, {
      principal: this.owner.principal,
      sessionId,
      visit,
      account,
      bootstrap,
      operationId: createId(),
      choice,
    });
    const response = await prepareTableContribution(
      this.client,
      this.context,
      review.preparation,
      guard,
      locale,
    );
    guard();
    return { choice, preparation: review.preparation, prepared: review.accept(response) };
  }
  async validate(candidate: TableContributionCandidate, locale: string, guard: () => void) {
    const live = await this.live(guard, candidate.preparation.sessionId);
    if (JSON.stringify(live.visit) !== JSON.stringify(candidate.preparation.visit))
      throw new ApiFailure(409, 'refused');
    const account = await readTablePaymentAccount(
      this.client,
      this.context,
      live.bootstrap,
      readScope(live, candidate.preparation.currency),
      guard,
      locale,
    );
    const review = tableContributionReview(this.context, {
      ...live,
      principal: this.owner.principal,
      account,
      operationId: candidate.preparation.intent.operationId,
      choice: candidate.choice,
    });
    if (JSON.stringify(review.preparation.intent) !== JSON.stringify(candidate.preparation.intent))
      throw new ApiFailure(409, 'refused');
    review.accept(candidate.prepared);
    guard();
  }
  async submit(record: TablePaymentRecord, candidate: TableContributionCandidate, locale: string) {
    await this.fresh(this.assertCurrent);
    const resolution = await resolveTableContribution(
      this.client,
      this.context,
      record,
      { phase: 'submit', preparation: candidate.preparation },
      this.assertCurrent,
      locale,
    );
    const saved = await this.repository.tablePayments.finishResolution(
      this.context,
      record,
      resolution,
      this.assertCurrent,
    );
    return saved.resolution?.outcome === 'Applied' && !saved.cancellationRequested
      ? this.start(saved, locale)
      : { record: saved, decision: null };
  }
  async check(locale: string) {
    let record = await this.load();
    if (!record) return null;
    if (tablePaymentResolved(record)) return { record, decision: null };
    const phase = record.cancellationRequested ? 'stop' : 'recover';
    if (!record.resolution) {
      const resolution = await this.sessions.recovery.tableContribution(
        record,
        phase,
        locale,
        this.assertCurrent,
      );
      record = await this.repository.tablePayments.finishResolution(
        this.context,
        record,
        resolution,
        this.assertCurrent,
      );
    }
    if (record.resolution?.outcome !== 'Applied') return { record, decision: null };
    const decision = await this.sessions.recovery.tableCheckout(
      record,
      phase,
      locale,
      this.assertCurrent,
    );
    record = await this.repository.tablePayments.finishCheckout(
      this.context,
      record,
      decision,
      this.assertCurrent,
    );
    return { record, decision };
  }
  async start(record: TablePaymentRecord, locale: string) {
    const live = await this.live(this.assertCurrent, record.sessionId);
    const preparation = this.originalPreparation(record, live.visit);
    const decision = await resolveTableCheckout(
      this.client,
      this.context,
      record,
      { phase: 'start', preparation },
      this.assertCurrent,
      locale,
    );
    const saved = await this.repository.tablePayments.finishCheckout(
      this.context,
      record,
      decision,
      this.assertCurrent,
    );
    return { record: saved, decision };
  }
}
