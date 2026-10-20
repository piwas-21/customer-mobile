import { reservationJournalFixture } from '../test/reservationCreate';
import { reservationTransportFixture } from '../test/reservationTransport';
import { reservationCancellationFixture as fixture } from '../test/reservationCancellation';
import { prepareReservationCancellation } from './reservationCancellation';
import { resolveReservationAttempt } from './reservationCreate';
import { reservationCancellationPath, reservationCreatePath } from '../core/reservationPaths';
import { reservationCreateResolutionSchema } from './reservationCreateContract';
import { secretKey } from '../core/credentials';
import { tenantB, directoryInput } from '../test/fixtures';
import { parseDirectory } from '../core/directory';
it('prepares a customer-owned cancellation without saving or dispatching the effect', async () => {
  const f = await fixture();
  f.fetcher.mockResolvedValue(f.reply(f.cancellation));
  expect(
    await prepareReservationCancellation(f.client, f.context, f.prepared, f.guard, 'en'),
  ).toEqual(f.cancellation);
  const [url, options] = f.fetcher.mock.calls[0]!;
  expect(url).toContain(reservationCancellationPath + '/prepare');
  expect(JSON.parse(options.body!)).toEqual(f.prepared.request);
  expect(options.headers).toMatchObject({
    Authorization: 'Bearer access',
    'X-Session-Id': f.prepared.sessionId,
  });
  expect(await f.repository.reservations.load(f.context, f.principal, f.guard)).toBeNull();
});
it('submits only the exact stored minimal cancellation proof and original session', async () => {
  const f = await fixture();
  const record = await f.install();
  f.fetcher.mockResolvedValue(f.reply(f.applied));
  expect(
    await resolveReservationAttempt(f.client, f.context, record, 'submit', f.guard, 'en'),
  ).toEqual(f.applied);
  const [url, options] = f.fetcher.mock.calls[0]!;
  expect(url).toContain(reservationCancellationPath + '/submit');
  expect(JSON.parse(options.body!)).toEqual(f.cancellation.proof);
  expect(options.body).not.toContain('Private customer request');
  expect(options.headers).toMatchObject({
    Authorization: 'Bearer access',
    'X-Session-Id': record.sessionId,
  });
});
it.each([
  'no-record',
  'changed-record',
  'create-body',
  'stop-without-intent',
  'wrong-result',
  'unseen-submit',
])('refuses changed or incomplete cancellation authority: %s', async (mode) => {
  const f = await fixture();
  const record = await f.install();
  f.fetcher.mockResolvedValue(
    f.reply(
      mode === 'wrong-result'
        ? { ...f.applied, reservationId: tenantB }
        : mode === 'unseen-submit'
          ? { ...f.applied, outcome: 'Unseen', reservationId: null }
          : f.applied,
    ),
  );
  const key = secretKey(f.context, 'reservation-operation', f.principal);
  if (mode === 'no-record') await f.store.remove(key);
  else if (mode === 'changed-record')
    await f.store.set(key, JSON.stringify({ ...record, sessionId: tenantB }));
  const action =
    mode === 'create-body'
      ? resolveReservationAttempt(
          f.client,
          f.context,
          record,
          'create',
          f.guard,
          'en',
          reservationJournalFixture(true).prepared.draft,
        )
      : resolveReservationAttempt(
          f.client,
          f.context,
          record,
          mode === 'stop-without-intent' ? 'cancel-attempt' : 'submit',
          f.guard,
          'en',
        );
  await expect(action).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(
    mode === 'wrong-result' || mode === 'unseen-submit' ? 1 : 0,
  );
});
it('never sends a creation record to the cancellation routes or a cancellation record to creation', async () => {
  const f = await fixture();
  const record = await f.install();
  for (const path of [
    reservationCreatePath,
    reservationCreatePath + '/recover',
    reservationCreatePath + '/cancel-attempt',
  ])
    await expect(
      f.client.request(f.context, path, reservationCreateResolutionSchema, {
        method: 'POST',
        credentials: 'reservation-operation',
        principal: f.principal,
        expectedReservationRecord: record,
        body: record.proof,
        assertCurrent: f.guard,
      }),
    ).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
});
it('refuses new cancellation submission on a read-only tenant but permits exact original recovery and stopping', async () => {
  const f = await fixture();
  await f.install();
  const directory = directoryInput();
  directory.tenants[0]!.status = 'read-only';
  f.boundary.updateDirectory(parseDirectory(directory, 'staging'));
  const context = f.boundary.capture();
  const guard = () => {
    if (context.signal.aborted) throw new Error('withdrawn');
  };
  const record = await f.repository.reservations.load(context, f.principal, guard);
  expect(record).not.toBeNull();
  f.fetcher.mockResolvedValue(f.reply({ ...f.applied, outcome: 'Unseen', reservationId: null }));
  await expect(
    resolveReservationAttempt(f.client, context, record!, 'submit', guard, 'en'),
  ).rejects.toThrow('read-only');
  expect(f.fetcher).not.toHaveBeenCalled();
  expect(
    (await resolveReservationAttempt(f.client, context, record!, 'recover', guard, 'en')).outcome,
  ).toBe('Unseen');
  const stopping = await f.repository.reservations.requestCancellation(
    context,
    f.principal,
    record!.proof.operationId,
    guard,
  );
  f.fetcher.mockResolvedValue(f.reply({ ...f.applied, outcome: 'Cancelled', reservationId: null }));
  expect(
    (await resolveReservationAttempt(f.client, context, stopping, 'cancel-attempt', guard, 'en'))
      .outcome,
  ).toBe('Cancelled');
});

it('refuses a stored creation proof on every cancellation operation route', async () => {
  const f = await reservationTransportFixture(true);
  const record = await f.install();
  for (const phase of ['submit', 'recover', 'cancel-attempt']) {
    await expect(
      f.client.request(
        f.context,
        reservationCancellationPath + '/' + phase,
        reservationCreateResolutionSchema,
        {
          method: 'POST',
          credentials: 'reservation-operation',
          principal: f.principal,
          expectedReservationRecord: record,
          body: record.proof,
          assertCurrent: f.guard,
        },
      ),
    ).rejects.toThrow();
  }
  expect(f.fetcher).not.toHaveBeenCalled();
});
