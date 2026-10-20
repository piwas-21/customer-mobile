import {
  cancellationPreparationSchema,
  type CancellationPreparation,
  type CancellationResolution,
} from '../api/orderCancellationContract';
import { resolveCancellation } from '../api/orderCancellation';
import { CustomerOperationOwner } from './customerOperationOwner';
import { canonicalUuidSchema } from './identifiers';
import { decisionProof, orderDecisionSchema, type OrderDecision } from './orderDecisions';
import type {
  CancellationAuthority,
  CancellationOperationRecord,
} from './cancellationOperationRecord';
import type { Principal } from './credentials';
import type { SessionController } from './sessionController';
import type { SessionRepository } from './sessionRepository';
import type { TenantContext } from './tenantContext';
import { SingleOperation } from './singleOperation';
import { ApiFailure, type CustomerTransport } from './transport';
import type { CancellationView, CancellationOffer } from './cancellationView';
export type { CancellationView, CancellationOffer } from './cancellationView';
export class CustomerCancellationController {
  private readonly scope: CustomerOperationOwner;
  private readonly actions = new SingleOperation<CancellationView | null>();
  private offerRevision = 0;
  private prepared: {
    preparation: CancellationPreparation;
    authority: CancellationAuthority;
  } | null = null;
  constructor(
    private readonly context: TenantContext,
    private readonly client: CustomerTransport,
    private readonly repository: SessionRepository,
    private readonly sessions: SessionController,
    principal: Principal,
    private readonly createId: () => string,
    private readonly orderingEnabled: boolean,
  ) {
    this.scope = new CustomerOperationOwner(context, sessions, principal);
  }
  readonly assertCurrent = () => this.scope.assertCurrent();
  dispose() {
    this.prepared = null;
    this.scope.dispose();
  }
  private assertStart() {
    this.assertCurrent();
    if (
      !this.orderingEnabled ||
      this.sessions.onlyRecoverOrders ||
      this.context.tenant.status !== 'active'
    )
      throw new ApiFailure(409, 'refused');
  }
  async offer(
    orderId: string,
    locale: string,
    original?: OrderDecision,
  ): Promise<CancellationOffer> {
    this.assertStart();
    if (this.actions.busy) throw new ApiFailure(409, 'refused');
    const revision = ++this.offerRevision;
    this.prepared = null;
    const id = canonicalUuidSchema.parse(orderId);
    let preparation: CancellationPreparation;
    let authority: CancellationAuthority;
    if (original) {
      const decision = orderDecisionSchema.parse(original);
      if (
        decision.outcome !== 'Applied' ||
        decision.orderId !== id ||
        decision.principal.kind !== this.scope.principal.kind ||
        decision.principal.id !== this.scope.principal.id
      )
        throw new ApiFailure(401, 'refused');
      authority = { kind: 'original', proof: decisionProof(decision) };
      preparation = await this.sessions.recovery.prepareCancellation(decision, locale);
    } else {
      if (this.scope.principal.kind !== 'customer') throw new ApiFailure(401, 'refused');
      authority = { kind: 'customer' };
      preparation = await this.sessions.get(
        this.scope.principal.id,
        `/api/customer-mobile/orders/${id}/cancellation?schemaVersion=1`,
        cancellationPreparationSchema,
      );
    }
    this.assertStart();
    if (revision !== this.offerRevision) throw new ApiFailure(409, 'refused');
    if (preparation.orderId !== id) throw new ApiFailure(200, 'contract');
    this.prepared = { preparation, authority };
    return { orderId: id, allowed: preparation.allowed, reason: preparation.reason };
  }
  async offerOriginal(orderId: string, operationId: string, locale: string) {
    this.assertStart();
    const records = await this.repository.orders.decisions(
      this.context,
      this.scope.principal,
      this.assertCurrent,
    );
    this.assertCurrent();
    const saved = records.find(
      (record) =>
        record.operationId === operationId &&
        record.orderId === orderId &&
        record.outcome === 'Applied',
    );
    if (!saved) throw new ApiFailure(404, 'refused');
    return this.offer(orderId, locale, saved);
  }
  confirm(orderId: string, locale: string) {
    this.assertStart();
    return this.actions.run(`confirm/${orderId}`, async () => {
      const prepared = this.prepared;
      if (prepared?.preparation.orderId !== orderId || !prepared.preparation.allowed)
        throw new ApiFailure(409, 'refused');
      this.prepared = null;
      const record = await this.repository.cancellations.prepare(
        this.context,
        this.scope.principal,
        prepared.authority,
        prepared.preparation,
        this.createId,
        this.assertCurrent,
      );
      this.assertCurrent();
      return this.dispatch(record, 'submit', locale);
    });
  }
  async saved(): Promise<CancellationView | null> {
    const record = await this.load();
    return record ? this.view(record, record.resolution) : null;
  }
  recover(locale: string) {
    this.assertCurrent();
    return this.actions.run('recover', async () => {
      const record = await this.load();
      if (!record) return null;
      if (record.resolution) return this.view(record, record.resolution);
      const result = await this.sessions.recovery.cancellation(record, locale);
      return this.accept(record, result);
    });
  }
  retryOriginal(operationId: string, locale: string) {
    this.assertCurrent();
    return this.actions.run(`retry/${operationId}`, async () => {
      const record = await this.load();
      if (record?.intent.operationId !== operationId) throw new ApiFailure(409, 'refused');
      if (record.resolution) return this.view(record, record.resolution);
      return this.dispatch(record, 'submit', locale);
    });
  }
  private load() {
    this.assertCurrent();
    return this.repository.cancellations.load(
      this.context,
      this.scope.principal,
      this.assertCurrent,
    );
  }
  private async dispatch(record: CancellationOperationRecord, phase: 'submit', locale: string) {
    const result = await resolveCancellation(
      this.client,
      this.context,
      record,
      phase,
      this.assertCurrent,
      locale,
    );
    return this.accept(record, result);
  }
  private async accept(record: CancellationOperationRecord, result: CancellationResolution) {
    this.assertCurrent();
    if (result.outcome === 'Unseen') return this.view(record, result);
    const saved = await this.repository.cancellations.finish(
      this.context,
      record,
      result,
      this.assertCurrent,
    );
    this.assertCurrent();
    return this.view(saved, saved.resolution);
  }
  private view(
    record: CancellationOperationRecord,
    result: CancellationResolution | null,
  ): CancellationView {
    this.assertCurrent();
    return {
      operationId: record.intent.operationId,
      orderId: record.intent.orderId,
      outcome: result?.outcome ?? 'Pending',
      reason: result?.reason ?? null,
    };
  }
}
