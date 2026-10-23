import { tablePlanFixture } from './tablePlanRepository';
import { SessionController } from '../core/sessionController';
import { secretKey } from '../core/credentials';
import { roundGuard } from './tableRoundRepository';
export async function tablePlanRenewalFixture() {
  const f = await tablePlanFixture(true);
  const record = await f.install();
  await f.store.remove(secretKey(f.context, 'guest-session', f.principal));
  await f.store.remove(secretKey(f.context, 'table-participant', f.principal));
  const sessions = new SessionController(f.context, f.client, f.repository, false);
  await sessions.initialize();
  return { ...f, sessions, record, guard: roundGuard };
}
