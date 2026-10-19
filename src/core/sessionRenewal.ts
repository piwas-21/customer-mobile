import type { OrderOperationProof } from './orderOperationProof';
import { refreshSession } from '../api/auth';
import type { CustomerSession } from './credentials';
import type { SessionRepository } from './sessionRepository';
import type { TenantContext } from './tenantContext';
import { ApiFailure, type CustomerTransport } from './transport';
export async function renewStoredSession(
  context: TenantContext,
  client: CustomerTransport,
  repository: SessionRepository,
  captured: CustomerSession,
  isCurrent: () => boolean,
  rejected: () => Promise<void>,
  proof?: OrderOperationProof,
): Promise<CustomerSession> {
  const guard = () => {
    if (!isCurrent()) throw new ApiFailure(401, 'refused');
  };
  guard();
  let next: CustomerSession;
  try {
    next = await refreshSession(client, context, captured, guard, proof);
  } catch (error) {
    guard();
    if (error instanceof ApiFailure && error.status === 401) await rejected();
    throw error;
  }
  guard();
  await repository.activate(context, next, isCurrent);
  guard();
  return next;
}
