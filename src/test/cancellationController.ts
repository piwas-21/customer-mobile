import { CustomerCancellationController } from '../core/customerCancellationController';
import { SessionController } from '../core/sessionController';
import { CustomerTransport, type Fetch } from '../core/transport';
import { cancellationStorageFixture } from './cancellationStorage';
import { response } from './transport';
export async function cancellationControllerFixture(customer = false) {
  const f = cancellationStorageFixture(customer);
  const fetcher = jest.fn<ReturnType<Fetch>, Parameters<Fetch>>();
  const client = new CustomerTransport(f.boundary, f.repository.vault, fetcher);
  const session = { userId: f.principal.id, accessToken: 'access', refreshToken: 'refresh' };
  if (customer) await f.repository.activate(f.context, session, () => true);
  const sessions = new SessionController(f.context, client, f.repository);
  await sessions.initialize();
  const createId = jest.fn(() => f.record.intent.operationId);
  const controller = new CustomerCancellationController(
    f.context,
    client,
    f.repository,
    sessions,
    f.principal,
    createId,
    true,
  );
  const decisions = await f.repository.orders.decisions(f.context, f.principal, f.guard);
  const original = customer ? undefined : decisions[0];
  const offer = () => controller.offer(f.record.intent.orderId, 'en', original);
  const canonical = {
    schemaVersion: 1,
    operationId: f.record.intent.operationId,
    orderId: f.record.intent.orderId,
    outcome: 'Cancelled',
    observedVersion: 8,
    reason: null,
  };
  const reply = (data: unknown) => response({ success: true, data });
  return {
    ...f,
    client,
    session,
    sessions,
    controller,
    createId,
    original,
    offer,
    fetcher,
    canonical,
    reply,
  };
}
