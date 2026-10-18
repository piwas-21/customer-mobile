import { SessionRepository } from '../core/sessionRepository';
import { deviceSecrets } from './secrets';
// Shared across restaurant generations; credential transactions cannot interleave.
export const deviceSessions = new SessionRepository(deviceSecrets);
