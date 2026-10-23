import { CustomerTablePaymentScope } from './customerTablePaymentScope';
import { tablePlanReview } from '../api/tablePlanReview';
import { prepareTablePlan, resolveTablePlan } from '../api/tablePlans';
import { ApiFailure } from './apiFailure';
import { tablePlanView } from './tablePlanView';
import type { TablePlanChoice } from '../domain/tablePlanSelection';
import type { TablePlanRecord } from './tablePlanRecord';
export type TablePlanCandidate = Awaited<ReturnType<TablePlanScope['prepare']>>;
export class TablePlanScope extends CustomerTablePaymentScope {
  load(guard = this.assertCurrent) {
    guard();
    return this.repository.tablePlans.load(this.context, this.owner.principal, guard);
  }
  private async reviewInput(
    choice: TablePlanChoice,
    operationId: string,
    createId: () => string,
    locale: string,
    guard: () => void,
  ) {
    const input = await this.reviewAccount(locale, createId, guard);
    return tablePlanReview(this.context, { ...input, operationId, choice });
  }
  async prepare(
    choice: TablePlanChoice,
    createId: () => string,
    locale: string,
    guard: () => void,
  ) {
    const review = await this.reviewInput(choice, createId(), createId, locale, guard);
    const response = await prepareTablePlan(
      this.client,
      this.context,
      review.preparation,
      guard,
      locale,
    );
    guard();
    return { choice, preparation: review.preparation, prepared: review.accept(response) };
  }
  async validate(candidate: TablePlanCandidate, locale: string, guard: () => void) {
    const review = await this.reviewInput(
      candidate.choice,
      candidate.preparation.intent.operationId,
      () => {
        throw new ApiFailure(409, 'refused');
      },
      locale,
      guard,
    );
    if (JSON.stringify(review.preparation) !== JSON.stringify(candidate.preparation))
      throw new ApiFailure(409, 'refused');
    review.accept(candidate.prepared);
    guard();
  }
  async submit(record: TablePlanRecord, candidate: TablePlanCandidate, locale: string) {
    await this.fresh(this.assertCurrent);
    const result = await resolveTablePlan(
      this.client,
      this.context,
      record,
      { phase: 'submit', preparation: candidate.preparation },
      this.assertCurrent,
      locale,
    );
    return this.finish(record, result);
  }
  async check(locale: string) {
    const record = await this.load();
    if (!record || record.resolution) return record ? tablePlanView(record) : null;
    const result = await this.sessions.recovery.tablePlan(
      record,
      record.cancellationRequested ? 'stop' : 'recover',
      locale,
      this.assertCurrent,
    );
    return this.finish(record, result);
  }
  private async finish(record: TablePlanRecord, value: unknown) {
    const saved = await this.repository.tablePlans.finish(
      this.context,
      record,
      value,
      this.assertCurrent,
    );
    this.assertCurrent();
    return tablePlanView(saved);
  }
}
