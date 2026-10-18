import { type Directory, type Environment, resolveTenant, type Tenant } from './directory';
export type TenantContext = Readonly<{
  environment: Environment;
  tenant: Tenant;
  generation: number;
  signal: AbortSignal;
}>;
export class TenantBoundary {
  private controller = new AbortController();
  private generation = 0;
  private current: TenantContext | undefined;
  constructor(private directory: Directory) {}
  select(id: string): TenantContext {
    const tenant = resolveTenant(this.directory, id);
    this.controller.abort();
    this.controller = new AbortController();
    this.current = Object.freeze({
      environment: this.directory.environment,
      tenant,
      generation: ++this.generation,
      signal: this.controller.signal,
    });
    return this.current;
  }
  updateDirectory(directory: Directory): void {
    if (directory.environment !== this.directory.environment)
      throw new Error('Environment mismatch');
    this.directory = directory;
    if (this.current) {
      const id = this.current.tenant.id;
      try {
        const next = resolveTenant(directory, id);
        if (JSON.stringify(next) === JSON.stringify(this.current.tenant)) return;
      } catch {
        this.clear();
        throw new Error('Restaurant is unavailable');
      }
      this.clear();
      this.select(id);
    }
  }
  capture(): TenantContext {
    if (!this.current) throw new Error('Select a restaurant');
    this.assertCurrent(this.current);
    return this.current;
  }
  assertCurrent(context: TenantContext): void {
    const tenant = resolveTenant(this.directory, context.tenant.id);
    if (
      context.signal.aborted ||
      context !== this.current ||
      tenant.apiOrigin !== context.tenant.apiOrigin
    ) {
      throw new Error('Restaurant context changed');
    }
  }
  clear(): void {
    this.controller.abort();
    this.current = undefined;
  }
}
export function scopeKey(
  context: TenantContext,
  principal: string,
  resource: string,
): readonly string[] {
  if (!principal || !resource) throw new Error('Principal and resource are required');
  return [context.environment, context.tenant.id, principal, resource];
}
