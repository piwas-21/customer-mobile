import { reservationJournalFixture } from './reservationCreate';
import { CustomerTransport, type Fetch } from '../core/transport';
import { response } from './transport';
export async function reservationTransportFixture(customer = false) {
  const f = reservationJournalFixture(customer);
  if (customer)
    await f.repository.vault.saveSession(f.context, {
      userId: f.principal.id,
      accessToken: 'access',
      refreshToken: 'refresh',
    });
  const fetcher = jest.fn<ReturnType<Fetch>, Parameters<Fetch>>();
  const client = new CustomerTransport(f.boundary, f.repository.vault, fetcher);
  const reply = (data: unknown) => response({ success: true, data });
  const install = () => f.repository.reservations.install(f.context, f.prepared, f.proof, f.guard);
  return { ...f, client, fetcher, reply, install };
}
