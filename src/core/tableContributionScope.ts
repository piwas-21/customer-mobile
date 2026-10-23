import { TableContributionAuthority } from './tableContributionAuthority';
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
    const input = await this.reviewAccount(locale, createId, guard);
    const review = tableContributionReview(this.context, {
      ...input,
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
    const input = await this.reviewAccount(
      locale,
      () => {
        throw new ApiFailure(409, 'refused');
      },
      guard,
    );
    const review = tableContributionReview(this.context, {
      ...input,
      operationId: candidate.preparation.intent.operationId,
      choice: candidate.choice,
    });
    if (JSON.stringify(review.preparation) !== JSON.stringify(candidate.preparation))
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
    const preparation = await this.currentPreparation(record);
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
