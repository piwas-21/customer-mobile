import { tableContributionControllerFixture } from '../test/tableContributionController';
import { tablePaymentAccountSchema } from '../api/tablePaymentAccountContract';
import { response } from '../test/transport';
import { secretKey } from './credentials';
import { tableContributionCheckoutPath } from './tableContributionRequest';
import { fixtureDirectory } from '../test/fixtures';
it.each(['limits', 'rollout', 'participant', 'session', 'currency'])(
  'withholds original reserved checkout opening after current %s withdrawal',
  async (mode) => {
    const f = await tableContributionControllerFixture();
    await f.install();
    f.state.accepted = true;
    const normal = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async (url, options) => {
      const result = await normal(url, options);
      if (mode === 'limits' && new URL(url).pathname.endsWith('/account')) {
        const envelope = (await result.json()) as { data: unknown };
        const account = tablePaymentAccountSchema.parse(envelope.data);
        account.account.limits.online!.maximumAmountMinor = 1399;
        return response({ success: true, data: account });
      }
      return result;
    });
    if (mode === 'rollout') f.bootstrap.capabilities['table-payments'] = 'disabled';
    if (mode === 'currency') f.bootstrap.currency = 'EUR';
    if (mode === 'participant')
      await f.store.remove(secretKey(f.context, 'table-participant', f.principal));
    if (mode === 'session')
      await f.store.remove(secretKey(f.context, 'guest-session', f.principal));
    const recovered = await f.actor.recover('en');
    expect(recovered?.state).toBe('reserved');
    expect(recovered?.canOpen).toBe(false);
    await expect(f.actor.open('en')).rejects.toThrow();
    expect(
      f.paths().filter((path) => path === tableContributionCheckoutPath + '/start'),
    ).toHaveLength(0);
    expect(f.openBrowser).not.toHaveBeenCalled();
    expect((await f.actor.saved())?.state).toBe('reserved');
  },
);
it.each(['url', 'expiry'])(
  'never opens a canonical Ready response with unsafe current %s',
  async (mode) => {
    const f = await tableContributionControllerFixture();
    await f.install();
    f.state.accepted = true;
    f.state.journal = true;
    const normal = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async (url, options) => {
      const result = await normal(url, options);
      if (new URL(url).pathname.startsWith(tableContributionCheckoutPath + '/')) {
        const envelope = (await result.json()) as {
          success: boolean;
          data: Record<string, unknown>;
        };
        if (mode === 'url')
          envelope.data.checkoutUrl = new URL(
            '/original',
            fixtureDirectory().tenants[1]!.webOrigin,
          ).toString();
        if (mode === 'expiry') envelope.data.expiresAt = new Date(Date.now() - 1).toISOString();
        return response(envelope);
      }
      return result;
    });
    expect((await f.actor.recover('en'))?.canOpen).toBe(false);
    await expect(f.actor.open('en')).rejects.toThrow();
    expect(f.openBrowser).not.toHaveBeenCalled();
    expect((await f.actor.saved())?.state).toBe('pending');
  },
);
