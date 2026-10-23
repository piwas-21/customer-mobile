import { tableContributionRenewalFixture } from '../test/tableContributionRenewal';
import { contributionResolution, contributionCheckout } from '../test/tablePayment';
import { authResponse, renewed, session } from '../test/sessions';
import { response } from '../test/transport';
import { tableContributionPath, tableContributionCheckoutPath } from './tableContributionRequest';
import { refreshPrivateTableSession } from '../api/privateTableRenewal';
import { tenantB } from '../test/fixtures';
it.each(['recover', 'stop'] as const)(
  'renews the same original Customer contribution %s once after participant withdrawal',
  async (phase) => {
    const f = await tableContributionRenewalFixture();
    const record =
      phase === 'stop'
        ? await f.repository.tablePayments.requestCancellation(
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
          : response({ success: true, data: contributionResolution() }),
    );
    expect(await f.sessions.recovery.tableContribution(record, phase, 'en', f.guard)).toEqual(
      contributionResolution(),
    );
    expect(f.sessions.onlyRecoverOrders).toBe(true);
    expect(f.fetcher.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      tableContributionPath + '/' + phase,
      '/api/Auth/refresh-token',
      tableContributionPath + '/' + phase,
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
it.each(['recover', 'stop'] as const)(
  'renews original hosted checkout %s without changing contribution identity',
  async (phase) => {
    const f = await tableContributionRenewalFixture();
    let record = await f.repository.tablePayments.finishResolution(
      f.context,
      f.record,
      contributionResolution(),
      f.guard,
    );
    if (phase === 'stop')
      record = await f.repository.tablePayments.requestCancellation(
        f.context,
        f.principal,
        record.proof.operationId,
        f.guard,
      );
    f.fetcher.mockImplementation(async (url, options) =>
      url.endsWith('/refresh-token')
        ? authResponse()
        : options.headers?.Authorization === 'Bearer old-access'
          ? response({}, 401)
          : response({ success: true, data: contributionCheckout() }),
    );
    expect(await f.sessions.recovery.tableCheckout(record, phase, 'en', f.guard)).toEqual(
      contributionCheckout(),
    );
    expect(f.fetcher.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      tableContributionCheckoutPath + '/' + phase,
      '/api/Auth/refresh-token',
      tableContributionCheckoutPath + '/' + phase,
    ]);
    expect(f.fetcher.mock.calls[2]![1].body).toBe(JSON.stringify(record.proof));
  },
);
it.each(['foreign-customer', 'wrong-token', 'guest', 'changed-proof'])(
  'refuses unbound native contribution renewal before dispatch: %s',
  async (mode) => {
    const f = await tableContributionRenewalFixture();
    const record = { ...f.record, proof: { ...f.record.proof } };
    const tokens = { ...session };
    if (mode === 'foreign-customer') tokens.userId = tenantB;
    if (mode === 'wrong-token') tokens.refreshToken = 'somebody-else';
    if (mode === 'guest') record.principal = { kind: 'guest', id: 'basket' };
    if (mode === 'changed-proof') record.proof.ownerProof = 'another-proof';
    await expect(
      refreshPrivateTableSession(f.client, f.context, tokens, f.guard, {
        kind: 'contribution',
        record,
      }),
    ).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
it('rejected original renewal retains private proof and Customer attention while withdrawing credentials', async () => {
  const f = await tableContributionRenewalFixture();
  f.fetcher.mockResolvedValue(response({}, 401));
  await expect(
    f.sessions.recovery.tableContribution(f.record, 'recover', 'en', f.guard),
  ).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  expect(f.sessions.userId).toBeNull();
  expect(await f.repository.vault.session(f.context, f.principal.id)).toBeNull();
  expect(await f.repository.tablePayments.load(f.context, f.principal, f.guard)).toEqual(f.record);
  expect(await f.repository.loadPaymentAttention(f.context)).toBe(f.principal.id);
});
it('a second unauthorized response ends recovery without another token renewal', async () => {
  const f = await tableContributionRenewalFixture();
  f.fetcher.mockImplementation(async (url) =>
    url.endsWith('/refresh-token') ? authResponse() : response({}, 401),
  );
  await expect(
    f.sessions.recovery.tableContribution(f.record, 'recover', 'en', f.guard),
  ).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(3);
  expect(f.fetcher.mock.calls.filter(([url]) => url.endsWith('/refresh-token'))).toHaveLength(1);
});
