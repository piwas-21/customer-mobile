import { readBasket } from '../api/basket';
import type { BasketItemMutation } from '../api/basketItemMutation';
import type { BasketAddInput } from '../api/basketRequest';
import { principalSchema, type Principal } from './credentials';
import { BasketOperationController } from './basketOperationController';
import type { SessionController } from './sessionController';
import type { SessionRepository } from './sessionRepository';
import type { TenantContext } from './tenantContext';
import { ApiFailure, type CustomerTransport } from './transport';
// A workspace lives for exactly one initialized owner revision, including same-user re-login.
export class BasketWorkspace {
  private readonly operations: BasketOperationController;
  private readonly principal: Principal;
  private readonly assertOwner: () => void;
  private disposed = false;
  constructor(
    private readonly context: TenantContext,
    private readonly client: CustomerTransport,
    private readonly repository: SessionRepository,
    sessions: SessionController,
    principal: Principal,
    createId: () => string,
  ) {
    this.principal = Object.freeze(principalSchema.parse(principal));
    this.assertOwner = sessions.captureRequestOwner(this.principal);
    this.operations = new BasketOperationController(
      context,
      client,
      repository.baskets,
      sessions,
      this.principal,
      createId,
    );
  }
  readonly assertCurrent = (): void => {
    if (this.disposed || this.context.signal.aborted) throw new ApiFailure(0, 'refused');
    this.assertOwner();
  };
  dispose(): void {
    this.disposed = true;
    this.operations.dispose();
  }
  async hasPending(): Promise<boolean> {
    this.assertCurrent();
    const pending = await this.operations.pending();
    this.assertCurrent();
    return pending !== null;
  }
  async read(locale: string) {
    this.assertCurrent();
    const session = await this.repository.vault.capability(
      this.context,
      'guest-session',
      this.principal,
    );
    this.assertCurrent();
    // Browsing an empty installation never creates a session or a server basket.
    if (session === null) return null;
    return readBasket(
      this.client,
      this.context,
      this.principal,
      session,
      this.assertCurrent,
      locale,
    );
  }
  add(input: BasketAddInput, locale: string) {
    this.assertCurrent();
    return this.operations.add(input, locale);
  }
  mutate(input: BasketItemMutation, locale: string) {
    this.assertCurrent();
    return this.operations.mutate(input, locale);
  }
  recover(locale: string) {
    this.assertCurrent();
    return this.operations.recover(locale);
  }
}
