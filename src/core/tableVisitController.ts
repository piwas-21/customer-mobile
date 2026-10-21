import { readBootstrap } from '../api/bootstrap';
import { readTablePaymentAccount } from '../api/tablePaymentAccount';
import { captureTablePaymentScope } from './tablePaymentReadScope';
import { assertTableVisitEnabled, joinTableVisit, readTableAccount } from '../api/tableVisits';
import { tableQrSchema } from '../api/tableVisitContract';
import { canonicalUuidSchema } from './identifiers';
import { principalSchema, type Principal } from './credentials';
import type { SessionController } from './sessionController';
import type { SessionRepository } from './sessionRepository';
import type { TenantContext } from './tenantContext';
import type { TableVisitRecord } from './tableVisitRecord';
import { SingleOperation } from './singleOperation';
import { ApiFailure, type CustomerTransport } from './transport';
export type TableVisitView = Readonly<{
  serviceSessionId: string;
  expiresAt: string;
  expired: boolean;
}>;
function view(record: TableVisitRecord): TableVisitView {
  return {
    serviceSessionId: record.identity.serviceSessionId,
    expiresAt: record.identity.expiresAt,
    expired: Date.parse(record.identity.expiresAt) <= Date.now(),
  };
}
// One original account/guest and restaurant lifetime. No QR or participant enters public view state.
export class TableVisitController {
  private readonly owner: Principal;
  private readonly assertOwner: () => void;
  private readonly mutations = new SingleOperation<TableVisitView | null>();
  private candidate: { reviewId: string; qr: string } | undefined;
  private reviewRevision = 0;
  private visitRevision = 0;
  private disposed = false;
  constructor(
    private readonly context: TenantContext,
    private readonly client: CustomerTransport,
    private readonly repository: SessionRepository,
    private readonly sessions: SessionController,
    principal: Principal,
    private readonly createId: () => string,
  ) {
    this.owner = principalSchema.parse(principal);
    this.assertOwner = sessions.captureRequestOwner(this.owner);
  }
  readonly assertCurrent = () => {
    if (this.disposed || this.context.signal.aborted) throw new ApiFailure(409, 'refused');
    this.assertOwner();
  };
  dispose() {
    this.disposed = true;
    this.visitRevision++;
    this.invalidateReview();
  }
  invalidateReview() {
    this.reviewRevision++;
    this.candidate = undefined;
  }
  dismiss(reviewId: string) {
    this.assertCurrent();
    if (this.candidate?.reviewId === canonicalUuidSchema.parse(reviewId)) this.invalidateReview();
  }
  async saved() {
    const guard = this.visitGuard();
    const record = await this.repository.tableVisits.read(this.context, this.owner, guard);
    guard();
    return record ? view(record) : null;
  }
  async prepare(qrCodeData: string) {
    this.assertStart();
    if (this.mutations.busy) throw new ApiFailure(409, 'refused');
    const qr = tableQrSchema.parse(qrCodeData);
    this.invalidateReview();
    const revision = this.reviewRevision;
    const guard = () => {
      this.assertStart();
      if (revision !== this.reviewRevision || this.mutations.busy)
        throw new ApiFailure(409, 'refused');
    };
    await this.fresh(guard);
    await this.requireRoundResolved(guard);
    if (await this.repository.tableVisits.read(this.context, this.owner, guard))
      throw new ApiFailure(409, 'refused');
    guard();
    const candidate = { reviewId: canonicalUuidSchema.parse(this.createId()), qr };
    this.candidate = candidate;
    return { reviewId: candidate.reviewId };
  }
  async confirm(reviewId: string, locale: string) {
    this.assertStart();
    const id = canonicalUuidSchema.parse(reviewId);
    const candidate = this.candidate;
    if (candidate?.reviewId !== id) throw new ApiFailure(409, 'refused');
    return this.mutations.run('join/' + id, async () => {
      const before = () => {
        this.assertStart();
        if (this.candidate !== candidate) throw new ApiFailure(409, 'refused');
      };
      const bootstrap = await this.fresh(before);
      await this.requireRoundResolved(before);
      if (await this.repository.tableVisits.read(this.context, this.owner, before))
        throw new ApiFailure(409, 'refused');
      before();
      this.invalidateReview();
      this.visitRevision++;
      const guard = this.visitGuard();
      const identity = await joinTableVisit(
        this.client,
        this.context,
        bootstrap,
        candidate.qr,
        guard,
        locale,
      );
      const record = await this.repository.tableVisits.install(
        this.context,
        this.owner,
        identity,
        guard,
      );
      guard();
      return view(record);
    });
  }
  async account(locale: string) {
    const guard = this.visitGuard();
    const record = await this.repository.tableVisits.read(this.context, this.owner, guard);
    guard();
    if (!record || Date.parse(record.identity.expiresAt) <= Date.now())
      throw new ApiFailure(410, 'refused');
    const bootstrap = await this.fresh(guard);
    return readTableAccount(this.client, this.context, bootstrap, record, guard, locale);
  }
  async paymentAccount(locale: string, assertView: () => void) {
    const visitGuard = this.visitGuard();
    const guard = () => {
      this.assertStart();
      visitGuard();
      assertView();
    };
    guard();
    const visit = await this.repository.tableVisits.read(this.context, this.owner, guard);
    if (!visit) throw new ApiFailure(410, 'refused');
    const bootstrap = await this.fresh(guard);
    const sessionId = await this.repository.tableVisits.paymentSession(
      this.context,
      visit,
      this.createId,
      guard,
    );
    guard();
    const scope = captureTablePaymentScope(this.context, this.owner, {
      visit,
      sessionId,
      currency: bootstrap.currency,
    });
    return readTablePaymentAccount(this.client, this.context, bootstrap, scope, guard, locale);
  }
  async leave(serviceSessionId: string) {
    this.assertCurrent();
    const id = canonicalUuidSchema.parse(serviceSessionId);
    return this.mutations.run('leave/' + id, async () => {
      this.invalidateReview();
      this.visitRevision++;
      const guard = this.visitGuard();
      await this.repository.tableVisits.leave(this.context, this.owner, id, guard);
      guard();
      return null;
    });
  }
  private visitGuard() {
    this.assertCurrent();
    const revision = this.visitRevision;
    return () => {
      this.assertCurrent();
      if (revision !== this.visitRevision) throw new ApiFailure(409, 'refused');
    };
  }
  private assertStart() {
    this.assertCurrent();
    if (this.sessions.onlyRecoverOrders) throw new ApiFailure(409, 'refused');
  }
  private async requireRoundResolved(guard: () => void) {
    const round = await this.repository.tableRounds.load(this.context, this.owner, guard);
    guard();
    if (round?.resolution === null) throw new ApiFailure(409, 'refused');
  }
  private async fresh(guard: () => void) {
    guard();
    const bootstrap = await readBootstrap(this.client, this.context, guard);
    guard();
    assertTableVisitEnabled(this.context, bootstrap);
    return bootstrap;
  }
}
