import { reservationEditControllerFixture as fixture } from '../test/reservationEditController';
import { resolveReservationAttempt } from '../api/reservationCreate';
import { reservationCreateResolutionSchema } from '../api/reservationCreateContract';
import {
  reservationEditPath,
  reservationCancellationPath,
  reservationCreatePath,
} from './reservationPaths';
import { deferred } from '../test/deferred';
import { tenantB } from '../test/fixtures';
import { secretKey } from './credentials';
it.each([
  'operation',
  'target',
  'contact',
  'staff-field',
  'proof-only',
  'creation-route',
  'cancellation-route',
  'foreign-principal',
] as const)(
  'refuses an edit body or route outside its exact persisted authority before I/O: %s',
  async (mode) => {
    const f = await fixture();
    const record = await f.install();
    const body = {
      ...f.prepared.draft,
      payloadHash: f.edit.proof.payloadHash,
      ownerProof: f.edit.proof.ownerProof,
    };
    let request: unknown = body;
    let path = reservationEditPath + '/submit';
    if (mode === 'operation') request = { ...body, operationId: tenantB };
    if (mode === 'target') request = { ...body, reservationId: tenantB };
    if (mode === 'contact') request = { ...body, customerEmail: 'different@example.test' };
    if (mode === 'staff-field') request = { ...body, status: 'Confirmed' };
    if (mode === 'proof-only') request = f.edit.proof;
    if (mode === 'creation-route') path = reservationCreatePath;
    if (mode === 'cancellation-route') path = reservationCancellationPath + '/submit';
    await expect(
      f.client.request(f.context, path, reservationCreateResolutionSchema, {
        method: 'POST',
        credentials: 'reservation-operation',
        principal: mode === 'foreign-principal' ? { kind: 'customer', id: tenantB } : f.principal,
        expectedReservationRecord: record,
        body: request,
        assertCurrent: f.guard,
      }),
    ).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
it('captures original edit body before delayed secure-header reads and ignores later caller mutation', async () => {
  const f = await fixture();
  const record = await f.install();
  const entered = deferred<void>();
  const release = deferred<void>();
  const read = f.repository.vault.capability.bind(f.repository.vault);
  jest.spyOn(f.repository.vault, 'capability').mockImplementation(async (...args) => {
    entered.resolve();
    await release.promise;
    return read(...args);
  });
  const draft = { ...f.prepared.draft };
  const send = resolveReservationAttempt(
    f.client,
    f.context,
    record,
    'submit',
    f.guard,
    'en',
    draft,
  );
  await entered.promise;
  draft.customerName = 'Late mutation';
  draft.reservationId = tenantB;
  release.resolve();
  await expect(send).resolves.toEqual(f.applied);
  expect(JSON.parse(f.fetcher.mock.calls[0]![1].body!)).toMatchObject({
    reservationId: f.applied.reservationId,
    customerName: 'Native guest',
  });
});
it.each(['contact-removed', 'proof-replaced'] as const)(
  'refuses the initial submit after durable %s',
  async (mode) => {
    const f = await fixture();
    const record = await f.install();
    if (mode === 'contact-removed')
      await f.store.remove(secretKey(f.context, 'reservation-contact', f.principal));
    else
      await f.store.set(
        secretKey(f.context, 'reservation-operation', f.principal),
        JSON.stringify({ ...record, edit: { ...record.edit, reservationId: tenantB } }),
      );
    await expect(
      resolveReservationAttempt(
        f.client,
        f.context,
        record,
        'submit',
        f.guard,
        'en',
        f.prepared.draft,
      ),
    ).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
it.each(['contact', 'proof'] as const)(
  'never submits without an exact acknowledged %s readback',
  async (mode) => {
    const f = await fixture();
    const actor = f.controller();
    const review = await actor.prepareEdit(f.input, 'en');
    const key = secretKey(
      f.context,
      mode === 'contact' ? 'reservation-contact' : 'reservation-operation',
      f.principal,
    );
    const read = f.store.get;
    const fault = jest
      .spyOn(f.store, 'get')
      .mockImplementation((name) =>
        name === key && f.store.values.has(key) ? Promise.resolve('wrong readback') : read(name),
      );
    await expect(actor.confirmEdit(review.operationId, 'en')).rejects.toThrow();
    fault.mockRestore();
    expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/submit'))).toBe(false);
    await expect(actor.confirmEdit(review.operationId, 'en')).rejects.toThrow();
    if (mode === 'proof') expect((await f.controller().saved())?.edit).toBe(true);
  },
);

it('restores the minimal edit view without reading its private contact intent', async () => {
  const f = await fixture();
  await f.install();
  const reads = jest.spyOn(f.store, 'get');
  expect(await f.controller().saved()).toMatchObject({
    edit: true,
    outcome: 'Pending',
    canRetry: false,
  });
  const contactKey = secretKey(f.context, 'reservation-contact', f.principal);
  expect(reads.mock.calls.some(([name]) => name === contactKey)).toBe(false);
});
