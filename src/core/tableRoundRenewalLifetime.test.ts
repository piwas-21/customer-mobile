import { tableRoundRenewalFixture } from '../test/tableRoundRenewal';
import { roundOutcome } from '../test/tableRoundRepository';
import { authResponse } from '../test/sessions';
import { deferred } from '../test/deferred';
import { response } from '../test/transport';

it.each(['owner', 'resource', 'tenant'])(
  'a withdrawn %s cannot install renewal or retry the original round',
  async (mode) => {
    const f = await tableRoundRenewalFixture();
    const entered = deferred<void>();
    const reply = deferred<Response>();
    let active = true;
    f.fetcher.mockImplementation(async (url) => {
      if (url.endsWith('/refresh-token')) {
        entered.resolve();
        return reply.promise;
      }
      return response({}, 401);
    });
    const pending = f.sessions.recovery.tableRound(f.record, 'recover', 'en', () => {
      if (!active) throw new Error('Resource withdrew');
    });
    const rejected = expect(pending).rejects.toThrow();
    await entered.promise;
    if (mode === 'owner') await f.sessions.logout();
    if (mode === 'resource') active = false;
    if (mode === 'tenant') f.boundary.clear();
    reply.resolve(authResponse());
    await rejected;
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    expect((await f.repository.vault.session(f.context, f.principal.id))?.accessToken).not.toBe(
      'new-access',
    );
  },
);
it('stopping during a paused customer token read prevents dispatch of the old first-submit record', async () => {
  const f = await tableRoundRenewalFixture();
  const entered = deferred<void>();
  const release = deferred<void>();
  const read = f.repository.vault.session.bind(f.repository.vault);
  jest.spyOn(f.repository.vault, 'session').mockImplementation(async (...args) => {
    entered.resolve();
    await release.promise;
    return read(...args);
  });
  f.fetcher.mockResolvedValue(response({ success: true, data: roundOutcome(f.record, true) }));
  const pending = f.sessions.recovery.tableRound(f.record, 'recover', 'en', f.guard);
  const rejected = expect(pending).rejects.toThrow();
  await entered.promise;
  await f.repository.tableRounds.requestCancellation(
    f.context,
    f.principal,
    f.record.proof.operationId,
    f.guard,
  );
  release.resolve();
  await rejected;
  expect(f.fetcher).not.toHaveBeenCalled();
});
