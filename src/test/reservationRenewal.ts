import { reservationControllerFixture } from './reservationController';
import { CustomerReservationController } from '../core/customerReservationController';
import { SessionController } from '../core/sessionController';
import { SessionRepository } from '../core/sessionRepository';
export async function reservationRenewalFixture() {
  const f = await reservationControllerFixture(true);
  await f.repository.reservations.install(f.context, f.prepared, f.proof, f.guard);
  f.sessions.dispose();
  const repository = new SessionRepository(f.store);
  const sessions = new SessionController(f.context, f.client, repository, false, true);
  await sessions.initialize();
  const bootstrap = {
    ...f.bootstrap,
    lifecycle: 'read-only' as const,
    capabilities: { reservations: 'disabled' as const, accounts: 'disabled' as const },
  };
  const actor = new CustomerReservationController(
    f.context,
    f.client,
    repository,
    sessions,
    f.principal,
    f.ids,
    bootstrap,
  );
  const authentication = (userId = f.principal.id) =>
    f.reply({
      userId,
      role: 'Customer',
      accessToken: 'renewed-access',
      refreshToken: 'renewed-refresh',
    });
  return { ...f, repository, sessions, actor, bootstrap, authentication };
}
