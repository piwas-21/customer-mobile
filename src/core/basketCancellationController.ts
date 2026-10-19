import { cancelBasketOperation, type BasketOperationResolution } from '../api/basketCancellation';
import type { CustomerBasket } from '../api/basketResponse';
import type {
  BasketOperationRepository,
  PendingBasketOperation,
} from './basketOperationRepository';
import type { Principal } from './credentials';
import type { TenantContext } from './tenantContext';
import { ApiFailure, type CustomerTransport } from './transport';
type AppliedProof = { pending: PendingBasketOperation; basket: CustomerBasket };
export class BasketCancellationController {
  private active: Promise<BasketOperationResolution> | null = null;
  private accepted: {
    pending: PendingBasketOperation;
    resolution: BasketOperationResolution;
  } | null = null;
  constructor(
    private readonly context: TenantContext,
    private readonly client: CustomerTransport,
    private readonly operations: BasketOperationRepository,
    private readonly principal: Principal,
    private readonly assertCurrent: () => void,
  ) {}
  get busy() {
    return this.active !== null;
  }
  get pending() {
    return this.accepted?.pending ?? null;
  }
  dispose() {
    this.accepted = null;
  }
  cancel(locale: string, applied: AppliedProof | null): Promise<BasketOperationResolution> {
    this.assertCurrent();
    if (this.active) return this.active;
    if (applied)
      this.accepted = {
        pending: applied.pending,
        resolution: {
          operationId: applied.pending.operationId,
          outcome: 'Applied',
          basket: applied.basket,
        },
      };
    const promise = this.resolve(locale).finally(() => {
      if (this.active === promise) this.active = null;
    });
    this.active = promise;
    return promise;
  }
  private async resolve(locale: string): Promise<BasketOperationResolution> {
    if (!this.accepted) {
      const previous = await this.operations.load(this.context, this.principal, this.assertCurrent);
      if (!previous) throw new ApiFailure(409, 'refused');
      const pending = await this.operations.requestCancellation(
        this.context,
        this.principal,
        previous.operationId,
        this.assertCurrent,
      );
      const resolution = await cancelBasketOperation(
        this.client,
        this.context,
        pending,
        this.assertCurrent,
        locale,
      );
      this.assertCurrent();
      this.accepted = { pending, resolution };
    }
    const accepted = this.accepted;
    await this.operations.finish(
      this.context,
      this.principal,
      accepted.pending.operationId,
      this.assertCurrent,
    );
    this.assertCurrent();
    this.accepted = null;
    return accepted.resolution;
  }
}
