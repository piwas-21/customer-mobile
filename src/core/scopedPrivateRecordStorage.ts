import { saveAcknowledgedSecret, removeAcknowledgedSecret } from './acknowledgedSecret';
import { secretKey, type CredentialKind, type Principal, type SecretStore } from './credentials';
import { ApiFailure } from './apiFailure';
import type { TenantContext } from './tenantContext';
type RecordPolicy<T> = {
  kind: CredentialKind;
  capture: (context: TenantContext, principal: Principal, value: unknown) => T;
  principal: (record: T) => Principal;
  resolved: (record: T) => boolean;
};
// Callers own the installation-wide serial queue; network I/O never holds it.
export class ScopedPrivateRecordStorage<T> {
  constructor(
    private readonly store: SecretStore,
    private readonly policy: RecordPolicy<T>,
  ) {}
  async read(context: TenantContext, principal: Principal, guard: () => void) {
    this.check(context, guard);
    const raw = await this.store.get(secretKey(context, this.policy.kind, principal));
    this.check(context, guard);
    return raw === null ? null : this.policy.capture(context, principal, JSON.parse(raw));
  }
  async readForCleanup(context: TenantContext, principal: Principal) {
    const raw = await this.store.get(secretKey(context, this.policy.kind, principal));
    return raw === null ? null : this.policy.capture(context, principal, JSON.parse(raw));
  }
  async save(context: TenantContext, input: T, guard: () => void) {
    const record = this.policy.capture(context, this.policy.principal(input), input);
    this.check(context, guard);
    await saveAcknowledgedSecret(
      this.store,
      secretKey(context, this.policy.kind, this.policy.principal(record)),
      JSON.stringify(record),
    );
    this.check(context, guard);
    return record;
  }
  async assertResolved(context: TenantContext, principal: Principal, guard: () => void) {
    const current = await this.read(context, principal, guard);
    if (current !== null && !this.policy.resolved(current)) throw new ApiFailure(409, 'refused');
  }
  async forgetResolved(context: TenantContext, input: T, guard: () => void) {
    const expected = this.policy.capture(context, this.policy.principal(input), input);
    const principal = this.policy.principal(expected);
    const current = await this.read(context, principal, guard);
    if (
      current === null ||
      !this.policy.resolved(current) ||
      JSON.stringify(current) !== JSON.stringify(expected)
    )
      throw new ApiFailure(409, 'refused');
    await removeAcknowledgedSecret(this.store, secretKey(context, this.policy.kind, principal));
    this.check(context, guard);
  }
  private check(context: TenantContext, guard: () => void) {
    if (context.signal.aborted) throw new ApiFailure(409, 'refused');
    guard();
  }
}
