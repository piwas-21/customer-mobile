import { tableRoundRenewalFixture } from '../test/tableRoundRenewal';
import { roundOutcome } from '../test/tableRoundRepository';
import { authResponse, renewed, session } from '../test/sessions';
import { response } from '../test/transport';
import { tableRoundPath } from './tableRoundRequest';
import { refreshTableRoundSession } from '../api/tableRounds';
import { secretKey } from './credentials';
import { tenantB } from '../test/fixtures';

it.each(['recover', 'cancel-attempt'] as const)(
  'renews only the original customer %s after participant and current-session removal',
  async (phase) => {
    const f = await tableRoundRenewalFixture();
    const record =
      phase === 'cancel-attempt'
        ? await f.repository.tableRounds.requestCancellation(
            f.context,
            f.principal,
            f.record.proof.operationId,
            f.guard,
          )
        : f.record;
    f.fetcher.mockImplementation(async (url, options) =>
      url.endsWith('/refresh-token')
        ? authResponse()
        : options.headers?.Authorization === 'Bearer old-access'
          ? response({}, 401)
          : response({ success: true, data: roundOutcome(record, true) }),
    );
    expect(await f.sessions.recovery.tableRound(record, phase, 'en', f.guard)).toEqual(
      roundOutcome(record, true),
    );
    expect(f.sessions.onlyRecoverOrders).toBe(true);
    expect(f.fetcher.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      tableRoundPath + '/' + phase,
      '/api/Auth/refresh-token',
      tableRoundPath + '/' + phase,
    ]);
    const [first, renewal, retry] = f.fetcher.mock.calls;
    expect(first![1].body).toBe(JSON.stringify(record.proof));
    expect(retry![1].body).toBe(first![1].body);
    expect(retry![1].headers).toMatchObject({
      Authorization: 'Bearer new-access',
      'X-Session-Id': record.sessionId,
    });
    expect(retry![1].headers?.['X-Table-Participant']).toBeUndefined();
    expect(renewal![1].headers?.Authorization).toBeUndefined();
    expect(JSON.parse(renewal![1].body!)).toEqual({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
    });
    expect(await f.repository.vault.session(f.context, f.principal.id)).toEqual(renewed);
  },
);
it.each(['foreign-customer', 'wrong-token', 'guest', 'terminal', 'changed-proof'])(
  'refuses unbound round renewal without dispatch: %s',
  async (mode) => {
    const f = await tableRoundRenewalFixture();
    const record = { ...f.record, proof: { ...f.record.proof } };
    const tokens = { ...session };
    if (mode === 'foreign-customer') tokens.userId = tenantB;
    if (mode === 'wrong-token') tokens.refreshToken = 'someone-else';
    if (mode === 'guest') record.principal = { kind: 'guest', id: 'basket' };
    if (mode === 'terminal') record.resolution = roundOutcome(record);
    if (mode === 'changed-proof') record.proof.ownerProof = 'another-proof';
    await expect(
      refreshTableRoundSession(f.client, f.context, tokens, f.guard, record),
    ).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
it('rejected original renewal keeps the private proof and customer reminder while removing credentials', async () => {
  const f = await tableRoundRenewalFixture();
  f.fetcher.mockResolvedValue(response({}, 401));
  await expect(
    f.sessions.recovery.tableRound(f.record, 'recover', 'en', f.guard),
  ).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  expect(f.sessions.userId).toBeNull();
  expect(await f.repository.vault.session(f.context, f.principal.id)).toBeNull();
  expect(await f.repository.tableRounds.load(f.context, f.principal, f.guard)).toEqual(f.record);
  expect(await f.repository.loadPaymentAttention(f.context)).toBe(f.principal.id);
  expect(f.store.values.has(secretKey(f.context, 'table-round-operation', f.principal))).toBe(true);
});
it('a refresh for another customer cannot replace the original identity or replay its request', async () => {
  const f = await tableRoundRenewalFixture();
  f.fetcher.mockImplementation(async (url) =>
    url.endsWith('/refresh-token')
      ? authResponse({ ...renewed, userId: tenantB })
      : response({}, 401),
  );
  await expect(
    f.sessions.recovery.tableRound(f.record, 'recover', 'en', f.guard),
  ).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  expect(await f.repository.vault.session(f.context, f.principal.id)).toEqual(session);
});
