import { CustomerReservationController } from '../core/customerReservationController';
import { SessionController } from '../core/sessionController';
import { CustomerTransport, type Fetch } from '../core/transport';
import { bootstrapSchema } from '../core/capabilities';
import { reservationBookingInputSchema } from '../api/reservationCreateContract';
import { reservationCreatePath } from '../core/reservationRequest';
import { reservationJournalFixture, reservationOperationId } from './reservationCreate';
import { response } from './transport';
export async function reservationControllerFixture(customer = false) {
  const f = reservationJournalFixture(customer);
  const fetcher = jest.fn<ReturnType<Fetch>, Parameters<Fetch>>();
  const client = new CustomerTransport(f.boundary, f.repository.vault, fetcher);
  if (customer)
    await f.repository.activate(
      f.context,
      { userId: f.principal.id, accessToken: 'access', refreshToken: 'refresh' },
      () => true,
    );
  const sessions = new SessionController(f.context, client, f.repository);
  await sessions.initialize();
  const bootstrap = bootstrapSchema.parse({
    schemaVersion: 1,
    tenantId: f.context.tenant.id,
    currency: 'CHF',
    locale: 'en',
    timezone: 'Europe/Zurich',
    lifecycle: 'active',
    compatibility: 'supported',
    modules: [],
    flags: {},
    capabilities: { reservations: 'enabled', accounts: 'enabled' },
  });
  const ids = jest
    .fn()
    .mockReturnValueOnce(reservationOperationId)
    .mockReturnValueOnce(f.prepared.sessionId);
  const controller = () =>
    new CustomerReservationController(
      f.context,
      client,
      f.repository,
      sessions,
      f.principal,
      ids,
      bootstrap,
    );
  const {
    schemaVersion: _schema,
    operationId: _operation,
    tenantId: _tenant,
    ...values
  } = f.prepared.draft;
  const input = reservationBookingInputSchema.parse(values);
  const reply = (data: unknown) => response({ success: true, data });
  fetcher.mockImplementation((url) =>
    Promise.resolve(
      reply(
        new URL(url).pathname.endsWith('/bootstrap')
          ? bootstrap
          : new URL(url).pathname === reservationCreatePath + '/prepare'
            ? f.proof
            : f.applied,
      ),
    ),
  );
  return { ...f, client, fetcher, sessions, bootstrap, ids, controller, input, reply };
}
