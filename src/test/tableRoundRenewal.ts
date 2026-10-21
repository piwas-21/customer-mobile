import { tableRoundFixture, roundGuard } from './tableRoundRepository';
import { SessionController } from '../core/sessionController';
import { secretKey } from '../core/credentials';
export async function tableRoundRenewalFixture() {
  const f = await tableRoundFixture(true);
  const record = await f.install();
  f.sessions.dispose();
  await f.store.remove(secretKey(f.context, 'table-participant', f.principal));
  await f.store.remove(secretKey(f.context, 'guest-session', f.principal));
  const sessions = new SessionController(f.context, f.client, f.repository, false, true);
  await sessions.initialize();
  f.fetcher.mockClear();
  return { ...f, record, sessions, guard: roundGuard };
}
