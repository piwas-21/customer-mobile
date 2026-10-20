import { principalSchema, type Principal } from './credentials';
import type { SessionController } from './sessionController';
import type { TenantContext } from './tenantContext';
import { ApiFailure } from './transport';
// Shared lifetime guard for original-order reads and their minimal payment decisions.
export class CustomerOperationOwner {
  readonly principal: Principal;
  private readonly owner: () => void;
  private disposed = false;
  constructor(
    private readonly context: TenantContext,
    sessions: SessionController,
    principal: Principal,
  ) {
    this.principal = Object.freeze(principalSchema.parse(principal));
    this.owner = sessions.captureRequestOwner(this.principal);
  }
  readonly assertCurrent = () => {
    if (this.disposed || this.context.signal.aborted) throw new ApiFailure(0, 'refused');
    this.owner();
  };
  dispose() {
    this.disposed = true;
  }
}
