import { bootstrapSchema, type Bootstrap } from './capabilities';
import { CustomerOperationOwner } from './customerOperationOwner';
import type { Principal } from './credentials';
import type { SessionRepository } from './sessionRepository';
import type { SessionController } from './sessionController';
import type { TenantContext } from './tenantContext';
import type { CustomerTransport } from './transport';

// Private operations share one immutable configuration and original session-owner lifetime.
export abstract class CustomerOperationScope {
  readonly owner: CustomerOperationOwner;
  readonly configuration: Bootstrap;
  constructor(
    readonly context: TenantContext,
    readonly client: CustomerTransport,
    readonly repository: SessionRepository,
    readonly sessions: SessionController,
    principal: Principal,
    bootstrap: Bootstrap,
  ) {
    this.owner = new CustomerOperationOwner(context, sessions, principal);
    this.configuration = bootstrapSchema.parse(bootstrap);
  }
  readonly assertCurrent = () => this.owner.assertCurrent();
}
