import { reservationTransportFixture as fixture } from '../test/reservationTransport';
import { prepareReservation, resolveReservationAttempt } from './reservationCreate';
import { reservationCreatePath } from '../core/reservationRequest';
it.each([false, true])(
  'prepares without a booking journal or basket credentials: customer=%p',
  async (customer) => {
    const f = await fixture(customer);
    f.fetcher.mockResolvedValue(f.reply(f.proof));
    const readCapability = jest.spyOn(f.repository.vault, 'capability');
    expect(await prepareReservation(f.client, f.context, f.prepared, f.guard, 'en')).toEqual(
      f.proof,
    );
    expect(readCapability).not.toHaveBeenCalled();
    expect(await f.repository.reservations.load(f.context, f.principal, f.guard)).toBeNull();
    const [url, options] = f.fetcher.mock.calls[0]!;
    expect(new URL(url).pathname).toBe(reservationCreatePath + '/prepare');
    expect(JSON.parse(options.body!)).toEqual(f.prepared.draft);
    expect(options.headers).toMatchObject({ 'X-Session-Id': f.prepared.sessionId });
    expect(options.headers?.Authorization).toBe(customer ? 'Bearer access' : undefined);
  },
);
it.each([false, true])(
  'creates only from exact durable owner-bound input: customer=%p',
  async (customer) => {
    const f = await fixture(customer);
    const record = await f.install();
    f.fetcher.mockResolvedValue(f.reply(f.applied));
    expect(
      await resolveReservationAttempt(
        f.client,
        f.context,
        record,
        'create',
        f.guard,
        'en',
        f.prepared.draft,
      ),
    ).toEqual(f.applied);
    const [url, options] = f.fetcher.mock.calls[0]!;
    expect(new URL(url).pathname).toBe(reservationCreatePath);
    expect(JSON.parse(options.body!)).toEqual({
      ...f.prepared.draft,
      payloadHash: f.proof.payloadHash,
      ownerProof: f.proof.ownerProof,
    });
    expect(options.headers?.['X-Session-Id']).toBe(f.prepared.sessionId);
    expect(options.headers?.Authorization).toBe(customer ? 'Bearer access' : undefined);
  },
);
it('recovers or seals with only the original proof after contacts and ordinary guest sessions are purged', async () => {
  const f = await fixture();
  const record = await f.install();
  await f.repository.vault.clear(f.context, f.principal);
  f.fetcher.mockResolvedValue(f.reply({ ...f.applied, outcome: 'Unseen', reservationId: null }));
  expect(
    (await resolveReservationAttempt(f.client, f.context, record, 'recover', f.guard, 'en'))
      .outcome,
  ).toBe('Unseen');
  const cancelling = await f.repository.reservations.requestCancellation(
    f.context,
    f.principal,
    f.proof.operationId,
    f.guard,
  );
  f.fetcher.mockResolvedValue(f.reply({ ...f.applied, outcome: 'Cancelled', reservationId: null }));
  expect(
    (
      await resolveReservationAttempt(
        f.client,
        f.context,
        cancelling,
        'cancel-attempt',
        f.guard,
        'en',
      )
    ).outcome,
  ).toBe('Cancelled');
  for (const [, options] of f.fetcher.mock.calls) {
    expect(JSON.parse(options.body!)).toEqual(f.proof);
    expect(options.headers?.['X-Session-Id']).toBe(f.prepared.sessionId);
    expect(options.headers?.Authorization).toBeUndefined();
    expect(options.body).not.toContain('guest@example.test');
  }
});
