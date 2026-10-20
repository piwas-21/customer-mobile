import { reservationEditControllerFixture as fixture } from '../test/reservationEditController';
import { reservationCancellationPath, reservationEditPath } from './reservationPaths';
import { deferred } from '../test/deferred';
import { tenantB } from '../test/fixtures';
it('a completed newer edit review withdraws a paused cancellation preparation before it can publish or confirm', async () => {
  const f = await fixture();
  const actor = f.controller();
  f.ids.mockReturnValueOnce('da96aa10-cc71-481a-b282-9b4bdc535626').mockReturnValueOnce(tenantB);
  const entered = deferred<void>();
  const release = deferred<Response>();
  const normal = f.fetcher.getMockImplementation()!;
  const next = { ...f.edit, proof: { ...f.edit.proof, operationId: tenantB } };
  f.fetcher.mockImplementation((url, options) => {
    if (new URL(url).pathname === reservationCancellationPath + '/prepare') {
      entered.resolve();
      return release.promise;
    }
    if (new URL(url).pathname === reservationEditPath + '/prepare')
      return Promise.resolve(f.reply(next));
    if (new URL(url).pathname === reservationEditPath + '/submit')
      return Promise.resolve(f.reply({ ...f.applied, operationId: tenantB }));
    return normal(url, options);
  });
  const first = actor.prepareCancellation(f.applied.reservationId, 'en');
  const refusal = expect(first).rejects.toThrow();
  await entered.promise;
  const second = await actor.prepareEdit(f.input, 'en');
  release.resolve(
    f.reply({
      schemaVersion: 1,
      proof: f.edit.proof,
      reservation: f.edit.original,
      timeZone: 'Europe/Zurich',
    }),
  );
  await refusal;
  await expect(actor.confirmCancellation(f.proof.operationId, 'en')).rejects.toThrow();
  expect(await actor.confirmEdit(second.operationId, 'en')).toMatchObject({
    edit: true,
    outcome: 'Applied',
    operationId: tenantB,
  });
  expect(f.fetcher.mock.calls.filter(([url]) => url.endsWith('/submit'))).toHaveLength(1);
});
