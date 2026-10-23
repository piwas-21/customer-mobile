import { ReviewedTableController } from './reviewedTableController';
import type { TablePaymentRecord } from './tablePaymentRecord';
import { ReviewedTableOperation } from './reviewedTableOperation';
import { canonicalUuidSchema } from './identifiers';
import {
  tableContributionChoiceSchema,
  type TableContributionChoice,
} from '../domain/tableContributionSelection';
import { TableContributionScope, type TableContributionCandidate } from './tableContributionScope';
import { tableContributionView, type TableContributionView } from './tableContributionView';
import type { Principal } from './credentials';
import type { Bootstrap } from './capabilities';
import type { CustomerTransport } from './transport';
import type { SessionController } from './sessionController';
import type { SessionRepository } from './sessionRepository';
import type { TenantContext } from './tenantContext';
export type TableContributionReviewView = Readonly<{
  operationId: string;
  mode: TableContributionChoice['mode'];
  amountMinor: number;
  currency: string;
}>;
type Resolution = Awaited<ReturnType<TableContributionScope['check']>>;
export class TableContributionController extends ReviewedTableController<
  TableContributionChoice,
  TableContributionCandidate,
  TablePaymentRecord,
  TableContributionView,
  TableContributionScope,
  TableContributionReviewView
> {
  protected readonly prepared: ReviewedTableOperation<
    TableContributionChoice,
    TableContributionCandidate,
    TablePaymentRecord,
    TableContributionView,
    TableContributionReviewView
  >;
  private readonly origins: readonly string[];
  protected readonly captureChoice = (input: TableContributionChoice) =>
    tableContributionChoiceSchema.parse(input);
  constructor(
    context: TenantContext,
    client: CustomerTransport,
    repository: SessionRepository,
    sessions: SessionController,
    principal: Principal,
    bootstrap: Bootstrap,
    private readonly createId: () => string,
    origins: readonly string[],
    private readonly openBrowser: (url: string) => Promise<unknown>,
  ) {
    const scope = new TableContributionScope(
      context,
      client,
      repository,
      sessions,
      principal,
      bootstrap,
    );
    super(scope, tableContributionView, (record) =>
      scope.repository.tablePayments.acknowledge(scope.context, record, scope.assertCurrent),
    );
    this.origins = Object.freeze([...origins]);
    this.prepared = new ReviewedTableOperation(this.review, this.mutations, {
      assertStart: () => scope.assertStart(),
      load: (guard) => scope.load(guard),
      prepare: (choice, locale, guard) => scope.prepare(choice, this.createId, locale, guard),
      project: (candidate) => ({
        operationId: candidate.prepared.proof.operationId,
        mode: candidate.prepared.mode,
        amountMinor: candidate.prepared.amountMinor,
        currency: candidate.prepared.currency,
      }),
      validate: (candidate, locale, guard) => scope.validate(candidate, locale, guard),
      install: (candidate) =>
        scope.repository.tablePayments.install(
          scope.context,
          candidate.preparation,
          candidate.prepared,
          this.assertCurrent,
        ),
      submit: async (record, candidate, locale) =>
        this.browse(await scope.submit(record, candidate, locale), locale),
    });
  }
  recover(locale: string) {
    this.assertCurrent();
    return this.mutations.run('recover', async () => {
      this.invalidateReview();
      return this.present(await this.scope.check(locale));
    });
  }
  open(locale: string) {
    this.assertCurrent();
    return this.mutations.run('open', async () => {
      this.invalidateReview();
      let resolved = await this.scope.check(locale);
      if (resolved?.decision?.outcome === 'reserved' && !resolved.record.cancellationRequested)
        resolved = await this.scope.start(resolved.record, locale);
      return this.browse(resolved, locale);
    });
  }
  stop(operationId: string, locale: string) {
    this.assertCurrent();
    const id = canonicalUuidSchema.parse(operationId);
    return this.mutations.run('stop/' + id, async () => {
      this.invalidateReview();
      await this.scope.repository.tablePayments.requestCancellation(
        this.scope.context,
        this.scope.owner.principal,
        id,
        this.assertCurrent,
      );
      return this.present(await this.scope.check(locale));
    });
  }
  private async browse(resolved: Resolution, locale: string) {
    if (resolved?.decision?.outcome !== 'ready') return this.present(resolved);
    const page = await this.scope.page(resolved.record, resolved.decision, this.origins);
    this.assertCurrent();
    try {
      await this.openBrowser(page);
    } finally {
      this.assertCurrent();
      await this.scope.check(locale);
    }
    return this.saved();
  }
  private async present(resolved: Resolution): Promise<TableContributionView | null> {
    if (!resolved) return null;
    let canOpen = false;
    if (resolved.decision?.outcome === 'ready' || resolved.decision?.outcome === 'reserved') {
      try {
        if (resolved.decision.outcome === 'ready')
          await this.scope.page(resolved.record, resolved.decision, this.origins);
        else await this.scope.currentPreparation(resolved.record);
        canOpen = true;
      } catch {
        this.assertCurrent();
      }
    }
    return tableContributionView(resolved.record, canOpen);
  }
}
