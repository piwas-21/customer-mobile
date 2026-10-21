import { prepareTableRound, resolveTableRound } from '../api/tableRounds';
import { tableRoundFixture, roundGuard, roundOutcome } from '../test/tableRoundRepository';
import { deferred } from '../test/deferred';
import { response } from '../test/transport';

it('captures private preparation and wire body before a paused credential read', async () => {
  const f = await tableRoundFixture();
  const entered = deferred<void>();
  const release = deferred<void>();
  const read = f.repository.vault.capability.bind(f.repository.vault);
  jest.spyOn(f.repository.vault, 'capability').mockImplementation(async (...args) => {
    entered.resolve();
    await release.promise;
    return read(...args);
  });
  f.fetcher.mockResolvedValue(response({ success: true, data: f.prepared }));
  const expected = JSON.stringify(f.review.preparation.intent);
  const pending = prepareTableRound(f.client, f.context, f.review.preparation, roundGuard, 'en');
  await entered.promise;
  f.review.preparation.intent.expectedAccountRevision = 99;
  f.review.preparation.visit.identity.participantToken = 'B'.repeat(43);
  release.resolve();
  await expect(pending).resolves.toEqual(f.prepared);
  expect(f.fetcher.mock.calls[0]![1].body).toBe(expected);
  expect(f.fetcher.mock.calls[0]![1].headers?.['X-Table-Participant']).toBe('A'.repeat(43));
});
it.each(['owner', 'tenant', 'expiry'])(
  'withdraws a private first-submit header read before dispatch: %s',
  async (mode) => {
    const f = await tableRoundFixture();
    const record = await f.install();
    const entered = deferred<void>();
    const release = deferred<void>();
    const read = f.repository.vault.capability.bind(f.repository.vault);
    let active = true;
    jest.spyOn(f.repository.vault, 'capability').mockImplementation(async (...args) => {
      entered.resolve();
      await release.promise;
      return read(...args);
    });
    const pending = resolveTableRound(
      f.client,
      f.context,
      record,
      { phase: 'submit', preparation: f.review.preparation },
      () => {
        if (!active) throw new Error('Owner withdrew');
      },
      'en',
    );
    const rejected = expect(pending).rejects.toThrow();
    await entered.promise;
    if (mode === 'owner') active = false;
    if (mode === 'tenant') f.boundary.clear();
    const clock =
      mode === 'expiry'
        ? jest
            .spyOn(Date, 'now')
            .mockReturnValue(Date.parse(f.review.preparation.visit.identity.expiresAt))
        : null;
    release.resolve();
    await rejected;
    clock?.mockRestore();
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
it('a late canonical response cannot publish after its owner withdraws', async () => {
  const f = await tableRoundFixture();
  const record = await f.install();
  const entered = deferred<void>();
  const release = deferred<Response>();
  let active = true;
  f.fetcher.mockImplementation(() => {
    entered.resolve();
    return release.promise;
  });
  const pending = resolveTableRound(
    f.client,
    f.context,
    record,
    { phase: 'recover' },
    () => {
      if (!active) throw new Error('Owner withdrew');
    },
    'en',
  );
  const rejected = expect(pending).rejects.toThrow();
  await entered.promise;
  active = false;
  release.resolve(response({ success: true, data: roundOutcome(record, true) }));
  await rejected;
  expect(await f.repository.tableRounds.load(f.context, f.principal, roundGuard)).toEqual(record);
});
