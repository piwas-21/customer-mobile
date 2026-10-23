import { TableOperationController } from './tableOperationController';
import type { TableRoundRecord } from './tableRoundRecord';
import { tableRoundQuoteSchema } from '../api/tableRoundContract';
import { SingleOperation } from './singleOperation';
import { TableRoundScope } from './tableRoundScope';
import { tableRoundView, type TableRoundView } from './tableRoundView';
import { canonicalUuidSchema } from './identifiers';
import { ApiFailure, type CustomerTransport } from './transport';
import type { Principal } from './credentials';
import type { Bootstrap } from './capabilities';
import type { SessionController } from './sessionController';
import type { SessionRepository } from './sessionRepository';
import type { TenantContext } from './tenantContext';

type Candidate = Awaited<ReturnType<TableRoundScope['prepare']>>;
export type TableRoundReviewView = Readonly<
  Pick<Candidate['prepared'], 'quote' | 'tableLabel'> & { operationId: string }
>;
export class TableRoundController extends TableOperationController<
  Candidate,
  TableRoundRecord,
  TableRoundView,
  TableRoundScope
> {
  private readonly preparations = new SingleOperation<TableRoundReviewView>();
  constructor(
    context: TenantContext,
    client: CustomerTransport,
    repository: SessionRepository,
    sessions: SessionController,
    principal: Principal,
    bootstrap: Bootstrap,
    private readonly createId: () => string,
  ) {
    const scope = new TableRoundScope(context, client, repository, sessions, principal, bootstrap);
    super(scope, tableRoundView, (record) =>
      scope.repository.tableRounds.acknowledge(scope.context, record, scope.assertCurrent),
    );
  }
  prepare(locale: string) {
    this.scope.assertStart();
    if (this.mutations.busy) throw new ApiFailure(409, 'refused');
    return this.preparations.run('prepare/' + locale, async () => {
      const guard = this.review.guard(
        () => this.scope.assertStart(),
        () => this.mutations.busy,
      );
      if (await this.scope.load(guard)) throw new ApiFailure(409, 'refused');
      const candidate = await this.scope.prepare(locale, this.createId, guard);
      if (await this.scope.load(guard)) throw new ApiFailure(409, 'refused');
      guard();
      this.review.current = candidate;
      return {
        operationId: candidate.prepared.proof.operationId,
        quote: tableRoundQuoteSchema.parse(candidate.prepared.quote),
        tableLabel: candidate.prepared.tableLabel,
      };
    });
  }
  confirm(operationId: string, locale: string) {
    this.scope.assertStart();
    const id = canonicalUuidSchema.parse(operationId);
    return this.mutations.run('submit/' + id, async () => {
      const candidate = this.review.current;
      if (candidate?.prepared.proof.operationId !== id) throw new ApiFailure(409, 'refused');
      const guard = () => {
        this.scope.assertStart();
        if (this.review.current !== candidate) throw new ApiFailure(409, 'refused');
      };
      if (await this.scope.load(guard)) throw new ApiFailure(409, 'refused');
      await this.scope.fresh(guard);
      guard();
      this.invalidateReview(); // Consume before secure installation: any uncertainty exposes recovery only.
      const record = await this.scope.repository.tableRounds.install(
        this.scope.context,
        candidate.preparation,
        candidate.prepared,
        this.assertCurrent,
      );
      return this.scope.submit(record, candidate.preparation, locale);
    });
  }
  recover(locale: string) {
    this.assertCurrent();
    return this.mutations.run('recover', async () => {
      this.invalidateReview();
      const record = await this.scope.load();
      return record ? this.scope.recover(record, 'recover', locale) : null;
    });
  }
  cancelAttempt(operationId: string, locale: string) {
    this.assertCurrent();
    const id = canonicalUuidSchema.parse(operationId);
    return this.mutations.run('cancel/' + id, async () => {
      this.invalidateReview();
      const record = await this.scope.repository.tableRounds.requestCancellation(
        this.scope.context,
        this.scope.owner.principal,
        id,
        this.assertCurrent,
      );
      return this.scope.recover(record, 'cancel-attempt', locale);
    });
  }
}
