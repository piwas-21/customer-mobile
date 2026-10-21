import { readTablePaymentAccount } from '../api/tablePaymentAccount';
import { tablePaymentAccountSchema } from '../api/tablePaymentAccountContract';
import {
  tablePaymentAccount,
  tablePaymentReadFixture,
  paymentReadSession,
} from '../test/tablePaymentAccount';
import { response } from '../test/transport';
import { tenantA, tenantB } from '../test/fixtures';
import { tablePaymentAccountPath } from './tablePaymentReadScope';

it.each([false, true])(
  'sends separate exact session and participant credentials with Customer auth when required: %s',
  async (customer) => {
    const f = await tablePaymentReadFixture(customer);
    expect(
      await readTablePaymentAccount(f.client, f.context, f.bootstrap, f.scope, () => {}, 'en'),
    ).toEqual(tablePaymentAccount());
    const [url, options] = f.fetcher.mock.calls[0]!;
    expect(url).toContain(tablePaymentAccountPath(f.context, f.scope));
    expect(options.method).toBe('GET');
    expect(options).not.toHaveProperty('body');
    expect(options.headers?.['X-Session-Id']).toBe(paymentReadSession);
    expect(options.headers?.['X-Table-Participant']).toBe('A'.repeat(43));
    expect(options.headers?.Authorization).toBe(customer ? 'Bearer original-access' : undefined);
  },
);
it.each(['tenant', 'visit', 'currency'])(
  'binds the response to the requested original account: %s',
  async (changed) => {
    const f = await tablePaymentReadFixture();
    const input = tablePaymentAccount();
    if (changed === 'tenant') input.tenantId = tenantB;
    if (changed === 'visit') input.account.serviceSessionId = tenantB;
    if (changed === 'currency') {
      input.account.currency = 'EUR';
      input.account.activeEqualSharePlan!.currency = 'EUR';
      input.account.activeAttempts.forEach((item) => {
        item.currency = 'EUR';
      });
    }
    f.fetcher.mockResolvedValue(response({ success: true, data: input }));
    await expect(
      readTablePaymentAccount(f.client, f.context, f.bootstrap, f.scope, () => {}, 'en'),
    ).rejects.toThrow();
  },
);
it.each(['method', 'body', 'path', 'mode'])(
  'refuses an unbound credential request before any dispatch: %s',
  async (changed) => {
    const f = await tablePaymentReadFixture();
    await expect(
      f.client.request(
        f.context,
        changed === 'path'
          ? '/api/customer-mobile/table-payments/account'
          : tablePaymentAccountPath(f.context, f.scope),
        tablePaymentAccountSchema,
        {
          method: changed === 'method' ? 'POST' : 'GET',
          credentials: changed === 'mode' ? 'customer' : 'table-payment-account',
          principal: f.scope.visit.principal,
          assertCurrent: () => {},
          expectedTablePaymentAccount: f.scope,
          ...(changed === 'body' ? { body: {} } : {}),
        },
      ),
    ).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
it.each(['session', 'participant', 'customer'])(
  'never substitutes a missing original private credential: %s',
  async (changed) => {
    const f = await tablePaymentReadFixture(true);
    if (changed === 'session')
      await f.vault.saveCapability(f.context, 'guest-session', f.scope.visit.principal, tenantA);
    if (changed === 'participant')
      await f.vault.saveCapability(
        f.context,
        'table-participant',
        f.scope.visit.principal,
        JSON.stringify({
          ...f.scope.visit,
          identity: { ...f.scope.visit.identity, participantToken: 'B'.repeat(42) + 'A' },
        }),
      );
    if (changed === 'customer') await f.vault.removeSession(f.context, tenantB);
    await expect(
      readTablePaymentAccount(f.client, f.context, f.bootstrap, f.scope, () => {}, 'en'),
    ).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
it.each(['accounts', 'feature', 'table'])(
  'refuses current capability withdrawal before dispatch: %s',
  async (changed) => {
    const f = await tablePaymentReadFixture(true);
    if (changed === 'accounts') f.bootstrap.capabilities.accounts = 'disabled';
    if (changed === 'feature') f.bootstrap.flags.tableAccountPaymentsV1 = false;
    if (changed === 'table') f.bootstrap.capabilities['table-visits'] = 'disabled';
    await expect(
      readTablePaymentAccount(f.client, f.context, f.bootstrap, f.scope, () => {}, 'en'),
    ).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
it('does not renew or downgrade a rejected current-account read', async () => {
  const f = await tablePaymentReadFixture(true);
  f.fetcher.mockResolvedValue(response({ success: false }, 401));
  await expect(
    readTablePaymentAccount(f.client, f.context, f.bootstrap, f.scope, () => {}, 'en'),
  ).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
