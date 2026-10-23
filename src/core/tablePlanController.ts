import { ReviewedTableController } from './reviewedTableController';
import type { TablePlanRecord } from './tablePlanRecord';
import { ReviewedTableOperation } from './reviewedTableOperation';
import { canonicalUuidSchema } from './identifiers';
import { tablePlanChoiceSchema, type TablePlanChoice } from '../domain/tablePlanSelection';
import { TablePlanScope, type TablePlanCandidate } from './tablePlanScope';
import { tablePlanView, type TablePlanView } from './tablePlanView';
import type { Principal } from './credentials';
import type { Bootstrap } from './capabilities';
import type { CustomerTransport } from './transport';
import type { SessionController } from './sessionController';
import type { SessionRepository } from './sessionRepository';
import type { TenantContext } from './tenantContext';
export type TablePlanReviewView = Readonly<{
  operationId: string;
  totalMinor: number;
  sharesMinor: readonly number[];
  currency: string;
}>;
export class TablePlanController extends ReviewedTableController<
  TablePlanChoice,
  TablePlanCandidate,
  TablePlanRecord,
  TablePlanView,
  TablePlanScope,
  TablePlanReviewView
> {
  protected readonly prepared: ReviewedTableOperation<
    TablePlanChoice,
    TablePlanCandidate,
    TablePlanRecord,
    TablePlanView,
    TablePlanReviewView
  >;
  protected readonly captureChoice = (input: TablePlanChoice) => tablePlanChoiceSchema.parse(input);
  constructor(
    context: TenantContext,
    client: CustomerTransport,
    repository: SessionRepository,
    sessions: SessionController,
    principal: Principal,
    bootstrap: Bootstrap,
    private readonly createId: () => string,
  ) {
    const scope = new TablePlanScope(context, client, repository, sessions, principal, bootstrap);
    super(scope, tablePlanView, (record) =>
      scope.repository.tablePlans.acknowledge(scope.context, record, scope.assertCurrent),
    );
    this.prepared = new ReviewedTableOperation(this.review, this.mutations, {
      assertStart: () => scope.assertStart(),
      load: (guard) => scope.load(guard),
      prepare: (choice, locale, guard) => scope.prepare(choice, this.createId, locale, guard),
      project: (candidate) => ({
        operationId: candidate.prepared.proof.operationId,
        totalMinor: candidate.prepared.totalMinor,
        sharesMinor: [...candidate.prepared.sharesMinor],
        currency: candidate.prepared.currency,
      }),
      validate: (candidate, locale, guard) => scope.validate(candidate, locale, guard),
      install: (candidate) =>
        scope.repository.tablePlans.install(
          scope.context,
          candidate.preparation,
          candidate.prepared,
          this.assertCurrent,
        ),
      submit: async (record, candidate, locale) => scope.submit(record, candidate, locale),
    });
  }
  recover(locale: string) {
    this.assertCurrent();
    return this.mutations.run('recover', async () => {
      this.invalidateReview();
      return this.scope.check(locale);
    });
  }
  stop(operationId: string, locale: string) {
    this.assertCurrent();
    const id = canonicalUuidSchema.parse(operationId);
    return this.mutations.run('stop/' + id, async () => {
      this.invalidateReview();
      await this.scope.repository.tablePlans.requestCancellation(
        this.scope.context,
        this.scope.owner.principal,
        id,
        this.assertCurrent,
      );
      return this.scope.check(locale);
    });
  }
}
