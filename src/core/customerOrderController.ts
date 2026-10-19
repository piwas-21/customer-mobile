import { SingleOperation } from './singleOperation';
import { basketResponseSchema } from '../api/basketResponse';
import { checkoutIntentSchema, type CheckoutIntent } from '../api/checkoutIntent';
import { prepareCustomerOrder } from '../api/checkoutPreparation';
import type { QuoteRequest } from '../api/checkoutQuoteScope';
import {
  recoverCustomerOrder,
  submitCustomerOrder,
  type CustomerOrderResolution,
} from '../api/customerOrderOperation';
import { bootstrapSchema } from './capabilities';
import { principalSchema, type Principal } from './credentials';
import type { OrderOperationProof } from './orderOperationProof';
import type { SessionController } from './sessionController';
import type { SessionRepository } from './sessionRepository';
import type { TenantContext } from './tenantContext';
import { ApiFailure, type CustomerTransport } from './transport';
type OrderRequest = Omit<QuoteRequest, 'principal' | 'sessionId'> & { intent: CheckoutIntent };
export class CustomerOrderController {
  private readonly principal: Principal;
  private readonly assertOwner: () => void;
  private disposed = false;
  private readonly requests = new SingleOperation<CustomerOrderResolution>();
  private resolved: CustomerOrderResolution | null = null;
  constructor(
    private readonly context: TenantContext,
    private readonly client: CustomerTransport,
    private readonly repository: SessionRepository,
    sessions: SessionController,
    principal: Principal,
    private readonly createId: () => string,
  ) {
    this.principal = Object.freeze(principalSchema.parse(principal));
    this.assertOwner = sessions.captureRequestOwner(this.principal);
  }
  dispose() {
    this.disposed = true;
    this.resolved = null;
  }
  readonly assertCurrent = () => {
    if (this.disposed || this.context.signal.aborted) throw new ApiFailure(0, 'refused');
    this.assertOwner();
  };
  async pending() {
    this.assertCurrent();
    const pending = await this.repository.orders.load(
      this.context,
      this.principal,
      this.assertCurrent,
    );
    this.assertCurrent();
    return pending
      ? { cancelling: pending.proof.cancellationRequested, canResume: pending.intent !== null }
      : null;
  }
  submit(input: OrderRequest): Promise<CustomerOrderResolution> {
    const request = {
      ...input,
      intent: checkoutIntentSchema.parse(input.intent),
      reviewed: basketResponseSchema.parse(input.reviewed),
      bootstrap: bootstrapSchema.parse(input.bootstrap),
    };
    return this.run(JSON.stringify(request.intent), async () => {
      if (
        this.resolved ||
        (await this.repository.orders.load(this.context, this.principal, this.assertCurrent)) ||
        (await this.repository.baskets.load(this.context, this.principal, this.assertCurrent))
      )
        throw new ApiFailure(409, 'refused');
      const sessionId = await this.repository.vault.capability(
        this.context,
        'guest-session',
        this.principal,
      );
      this.assertCurrent();
      if (sessionId === null) throw new ApiFailure(409, 'refused');
      const prepared = await prepareCustomerOrder(
        this.client,
        this.context,
        { ...request, principal: this.principal, sessionId },
        this.assertCurrent,
      );
      this.assertCurrent();
      const pending = await this.repository.orders.prepare(
        this.context,
        this.principal,
        prepared,
        this.createId,
        this.assertCurrent,
      );
      this.assertCurrent();
      return this.accept(
        await submitCustomerOrder(
          this.client,
          this.context,
          pending,
          this.assertCurrent,
          request.locale,
        ),
      );
    });
  }
  recover(locale: string) {
    return this.run('recover', async () => {
      if (this.resolved) return this.acknowledge();
      const pending = await this.repository.orders.load(
        this.context,
        this.principal,
        this.assertCurrent,
      );
      if (!pending) throw new ApiFailure(409, 'refused');
      return this.resolve(pending.proof, locale);
    });
  }
  cancel(locale: string) {
    return this.run('cancel', async () => {
      if (this.resolved) return this.acknowledge();
      const pending = await this.repository.orders.load(
        this.context,
        this.principal,
        this.assertCurrent,
      );
      if (!pending) throw new ApiFailure(409, 'refused');
      const proof = await this.repository.orders.requestCancellation(
        this.context,
        this.principal,
        pending.proof.operationId,
        this.assertCurrent,
      );
      return this.resolve(proof, locale);
    });
  }
  private async resolve(proof: OrderOperationProof, locale: string) {
    const result = await recoverCustomerOrder(
      this.client,
      this.context,
      proof,
      this.assertCurrent,
      locale,
    );
    if (result.outcome === 'Unseen') return result;
    return this.accept(result);
  }
  private accept(result: CustomerOrderResolution) {
    this.assertCurrent();
    this.resolved = result;
    return this.acknowledge();
  }
  private async acknowledge() {
    this.assertCurrent();
    const result = this.resolved;
    if (!result) throw new ApiFailure(409, 'refused');
    await this.repository.orders.finish(this.context, this.principal, result, this.assertCurrent);
    this.assertCurrent();
    this.resolved = null;
    return result;
  }
  private run(key: string, work: () => Promise<CustomerOrderResolution>) {
    this.assertCurrent();
    return this.requests.run(key, work);
  }
}
