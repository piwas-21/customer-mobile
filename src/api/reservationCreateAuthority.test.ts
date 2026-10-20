import { reservationTransportFixture as fixture } from '../test/reservationTransport';
import { prepareReservation, resolveReservationAttempt } from './reservationCreate';
import type { RequestOptions } from '../core/transport';
import { reservationCreateResolutionSchema } from './reservationCreateContract';
import { reservationCreatePath } from '../core/reservationRequest';
import { response } from '../test/transport';
import type { ReservationOperationRecord } from '../core/reservationOperationRecord';
import { secretKey } from '../core/credentials';
import { deferred } from '../test/deferred';
import { tenantB, directoryInput } from '../test/fixtures';
import { parseDirectory } from '../core/directory';
it.each(['no-proof', 'no-intent', 'changed-intent', 'cancelling', 'terminal'])(
  'refuses creation without exact original durable authority: %s',
  async (mode) => {
    const f = await fixture();
    let record: ReservationOperationRecord = await f.install();
    if (mode === 'no-proof')
      await f.store.remove(secretKey(f.context, 'reservation-operation', f.principal));
    else if (mode === 'no-intent') await f.repository.vault.clear(f.context, f.principal);
    else if (mode === 'changed-intent') {
      const key = secretKey(f.context, 'reservation-contact', f.principal);
      const saved = JSON.parse(f.store.values.get(key)!) as { draft: { customerName: string } };
      saved.draft.customerName = 'Changed private intent';
      await f.store.set(key, JSON.stringify(saved));
    } else if (mode === 'cancelling')
      record = await f.repository.reservations.requestCancellation(
        f.context,
        f.principal,
        f.proof.operationId,
        f.guard,
      );
    else
      record = await f.repository.reservations.finish(f.context, f.principal, f.applied, f.guard);
    await expect(
      resolveReservationAttempt(
        f.client,
        f.context,
        record,
        'create',
        f.guard,
        'en',
        f.prepared.draft,
      ),
    ).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
it('refuses a changed full body or cancellation without durable explicit intent before I/O', async () => {
  const f = await fixture();
  const record = await f.install();
  await expect(
    resolveReservationAttempt(f.client, f.context, record, 'create', f.guard, 'en', {
      ...f.prepared.draft,
      customerName: 'Changed',
    }),
  ).rejects.toThrow();
  await expect(
    resolveReservationAttempt(f.client, f.context, record, 'cancel-attempt', f.guard, 'en'),
  ).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
});
it.each([{ operationId: tenantB }, { tenantId: tenantB }])(
  'refuses a preparation acknowledgement for another scope: %j',
  async (patch) => {
    const f = await fixture();
    f.fetcher.mockResolvedValue(f.reply({ ...f.proof, ...patch }));
    await expect(
      prepareReservation(f.client, f.context, f.prepared, f.guard, 'en'),
    ).rejects.toMatchObject({ reason: 'contract' });
  },
);
it('refuses successful but unknown create/cancel decisions and a foreign operation result', async () => {
  const f = await fixture();
  const record = await f.install();
  f.fetcher.mockResolvedValue(f.reply({ ...f.applied, outcome: 'Unseen', reservationId: null }));
  await expect(
    resolveReservationAttempt(
      f.client,
      f.context,
      record,
      'create',
      f.guard,
      'en',
      f.prepared.draft,
    ),
  ).rejects.toThrow();
  const cancelling = await f.repository.reservations.requestCancellation(
    f.context,
    f.principal,
    f.proof.operationId,
    f.guard,
  );
  await expect(
    resolveReservationAttempt(f.client, f.context, cancelling, 'cancel-attempt', f.guard, 'en'),
  ).rejects.toThrow();
  f.fetcher.mockResolvedValue(f.reply({ ...f.applied, operationId: tenantB }));
  await expect(
    resolveReservationAttempt(f.client, f.context, cancelling, 'recover', f.guard, 'en'),
  ).rejects.toThrow();
});
it('does not fall back to guest or automatically replay after rejected account credentials', async () => {
  const f = await fixture(true);
  const record = await f.install();
  f.fetcher.mockResolvedValue(response({ success: false }, 401));
  await expect(
    resolveReservationAttempt(f.client, f.context, record, 'recover', f.guard, 'en'),
  ).rejects.toMatchObject({ status: 401 });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  expect(f.fetcher.mock.calls[0]![1].headers?.Authorization).toBe('Bearer access');
  await f.repository.vault.clear(f.context, f.principal);
  await expect(
    resolveReservationAttempt(f.client, f.context, record, 'recover', f.guard, 'en'),
  ).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it('refuses old credentials and private results after tenant or owner lifetime changes', async () => {
  const f = await fixture();
  const record = await f.install();
  const reply = deferred<Response>();
  const entered = deferred<void>();
  f.fetcher.mockImplementationOnce(() => {
    entered.resolve();
    return reply.promise;
  });
  const read = resolveReservationAttempt(f.client, f.context, record, 'recover', f.guard, 'en');
  await entered.promise;
  f.boundary.select(tenantB);
  reply.resolve(f.reply(f.applied));
  await expect(read).rejects.toThrow();
});
it('permits contact-free recovery on readonly restaurants while refusing new preparation and creation', async () => {
  const f = await fixture();
  const record = await f.install();
  const next = directoryInput();
  next.tenants[0]!.status = 'read-only';
  f.boundary.updateDirectory(parseDirectory(next, 'staging'));
  const context = f.boundary.capture();
  const guard = () => {};
  f.fetcher.mockResolvedValue(f.reply(f.applied));
  await expect(prepareReservation(f.client, context, f.prepared, guard, 'en')).rejects.toThrow();
  await expect(
    resolveReservationAttempt(f.client, context, record, 'create', guard, 'en', f.prepared.draft),
  ).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
  expect(
    await resolveReservationAttempt(f.client, context, record, 'recover', guard, 'en'),
  ).toEqual(f.applied);
});
it.each(['method', 'principal', 'guard', 'mode', 'preparation'])(
  'refuses malformed preparation transport authority: %s',
  async (fault) => {
    const f = await fixture();
    const options: RequestOptions = {
      method: 'POST',
      credentials: 'reservation-prepare',
      principal: f.principal,
      expectedReservationPreparation: f.prepared,
      assertCurrent: f.guard,
      body: f.prepared.draft,
    };
    if (fault === 'method') options.method = 'GET';
    else if (fault === 'principal') delete options.principal;
    else if (fault === 'guard') delete options.assertCurrent;
    else if (fault === 'mode') options.credentials = 'customer';
    else delete options.expectedReservationPreparation;
    await expect(
      f.client.request(
        f.context,
        reservationCreatePath + '/prepare',
        reservationCreateResolutionSchema,
        options,
      ),
    ).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
