import { TableOperationController } from './tableOperationController';
import type { TablePaymentRecord } from './tablePaymentRecord';
import { SingleOperation } from './singleOperation';
import { canonicalUuidSchema } from './identifiers';
import { ApiFailure } from './apiFailure';
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
export class TableContributionController extends TableOperationController<
  TableContributionCandidate,
  TablePaymentRecord,
  TableContributionView,
  TableContributionScope
> {
  private readonly preparations = new SingleOperation<TableContributionReviewView>();
  private readonly origins: readonly string[];
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
  }
  prepare(input: TableContributionChoice, locale: string) {
    this.scope.assertStart();
    const choice = tableContributionChoiceSchema.parse(input);
    if (this.mutations.busy) throw new ApiFailure(409, 'refused');
    return this.preparations.run(JSON.stringify(choice), async () => {
      const guard = this.review.guard(
        () => this.scope.assertStart(),
        () => this.mutations.busy,
      );
      if (await this.scope.load(guard)) throw new ApiFailure(409, 'refused');
      const candidate = await this.scope.prepare(choice, this.createId, locale, guard);
      if (await this.scope.load(guard)) throw new ApiFailure(409, 'refused');
      guard();
      this.review.current = candidate;
      return {
        operationId: candidate.prepared.proof.operationId,
        mode: candidate.prepared.mode,
        amountMinor: candidate.prepared.amountMinor,
        currency: candidate.prepared.currency,
      };
    });
  }
  confirm(operationId: string, locale: string) {
    this.scope.assertStart();
    const id = canonicalUuidSchema.parse(operationId);
    return this.mutations.run('confirm/' + id, async () => {
      const candidate = this.review.current;
      if (candidate?.prepared.proof.operationId !== id) throw new ApiFailure(409, 'refused');
      const guard = () => {
        this.scope.assertStart();
        if (this.review.current !== candidate) throw new ApiFailure(409, 'refused');
      };
      try {
        if (await this.scope.load(guard)) throw new ApiFailure(409, 'refused');
        await this.scope.validate(candidate, locale, guard);
        guard();
        this.invalidateReview();
        const record = await this.scope.repository.tablePayments.install(
          this.scope.context,
          candidate.preparation,
          candidate.prepared,
          this.assertCurrent,
        );
        return this.browse(await this.scope.submit(record, candidate, locale), locale);
      } catch (error) {
        this.invalidateReview();
        throw error;
      }
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
    if (resolved.decision?.outcome === 'ready') {
      try {
        await this.scope.page(resolved.record, resolved.decision, this.origins);
        canOpen = true;
      } catch {
        this.assertCurrent();
      }
    }
    return tableContributionView(resolved.record, canOpen);
  }
}
