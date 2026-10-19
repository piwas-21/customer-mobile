import { basketAddInputSchema, type BasketAddInput } from '../api/basketRequest';
import { submitBasketOperation } from '../api/basket';
import type { CustomerBasket } from '../api/basketResponse';
import { readBootstrap } from '../api/bootstrap';
import { canUse } from './capabilities';
import { principalSchema, type Principal } from './credentials';
import { ApiFailure, type CustomerTransport } from './transport';
import type {
  BasketOperationRepository,
  PendingBasketOperation,
} from './basketOperationRepository';
import type { SessionController } from './sessionController';
import type { TenantContext } from './tenantContext';

export class BasketOperationController {
  private readonly principal: Principal;
  private readonly assertOwner: () => void;
  private disposed = false;
  private active: { key: string; promise: Promise<CustomerBasket> } | null = null;
  private accepted: { pending: PendingBasketOperation; basket: CustomerBasket } | null = null;
  constructor(
    private readonly context: TenantContext,
    private readonly client: CustomerTransport,
    private readonly operations: BasketOperationRepository,
    sessions: SessionController,
    principal: Principal,
    private readonly createId: () => string,
  ) {
    this.principal = Object.freeze(principalSchema.parse(principal));
    this.assertOwner = sessions.captureRequestOwner(this.principal);
  }

  dispose(): void {
    this.disposed = true;
    this.accepted = null;
  }

  async pending(): Promise<PendingBasketOperation | null> {
    this.assertCurrent();
    return (
      this.accepted?.pending ??
      this.operations.load(this.context, this.principal, this.assertCurrent)
    );
  }

  async add(input: BasketAddInput, locale: string): Promise<CustomerBasket> {
    const request = basketAddInputSchema.parse(input);
    return this.run(JSON.stringify(request), async () => {
      if (this.accepted) throw new ApiFailure(409, 'refused');
      if (await this.operations.load(this.context, this.principal, this.assertCurrent))
        throw new ApiFailure(409, 'refused');
      const bootstrap = await readBootstrap(this.client, this.context);
      this.assertCurrent();
      if (!canUse(bootstrap, 'ordering')) throw new ApiFailure(404, 'refused');
      const pending = await this.operations.prepare(
        this.context,
        this.principal,
        request,
        this.createId,
        this.assertCurrent,
        'create-only',
      );
      return this.submit(pending, locale);
    });
  }

  // Recovery is an explicit user action and never creates a new operation or changes its payload.
  async recover(locale: string): Promise<CustomerBasket> {
    return this.run('recover', async () => {
      if (this.accepted) return this.acknowledge();
      const pending = await this.operations.load(this.context, this.principal, this.assertCurrent);
      if (!pending) throw new ApiFailure(409, 'refused');
      return this.submit(pending, locale);
    });
  }

  private async submit(pending: PendingBasketOperation, locale: string): Promise<CustomerBasket> {
    const basket = await submitBasketOperation(
      this.client,
      this.context,
      pending,
      this.assertCurrent,
      locale,
    );
    this.assertCurrent();
    this.accepted = { pending, basket };
    return this.acknowledge();
  }

  private async acknowledge(): Promise<CustomerBasket> {
    this.assertCurrent();
    const accepted = this.accepted;
    if (!accepted) throw new ApiFailure(409, 'refused');
    await this.operations.finish(
      this.context,
      this.principal,
      accepted.pending.operationId,
      this.assertCurrent,
    );
    this.assertCurrent();
    this.accepted = null;
    return accepted.basket;
  }

  private run(key: string, work: () => Promise<CustomerBasket>): Promise<CustomerBasket> {
    this.assertCurrent();
    if (this.active) {
      if (this.active.key !== key) throw new ApiFailure(409, 'refused');
      return this.active.promise;
    }
    const promise = work().finally(() => {
      if (this.active?.promise === promise) this.active = null;
    });
    this.active = { key, promise };
    return promise;
  }

  private readonly assertCurrent = (): void => {
    if (this.disposed || this.context.signal.aborted) throw new ApiFailure(0, 'refused');
    this.assertOwner();
  };
}
