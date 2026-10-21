import { tableVisitControllerFixture } from '../test/tableVisitController';
import { tablePaymentAccount } from '../test/tablePaymentAccount';
import { tableAccount } from '../test/tableAccount';
import { response } from '../test/transport';
import { tenantA, tenantB } from '../test/fixtures';
import { secretKey } from './credentials';
import { deferred } from '../test/deferred';

async function fixture(customer = false) {
  const f = await tableVisitControllerFixture(customer);
  f.bootstrap.flags.tableAccountPaymentsV1 = true;
  f.bootstrap.capabilities.accounts = 'enabled';
  f.fetcher.mockImplementation(async (url) =>
    response({
      success: true,
      data: url.includes('/bootstrap?')
        ? f.bootstrap
        : url.includes('/table-payments/account?')
          ? tablePaymentAccount()
          : tableAccount(),
    }),
  );
  const visit = await f.install();
  return { ...f, visit };
}
it.each([false, true])(
  'reads a staff-entered table bill without requiring a native basket: customer=%s',
  async (customer) => {
    const f = await fixture(customer);
    expect(await f.repository.vault.capability(f.context, 'guest-session', f.principal)).toBeNull();
    expect(await f.actor.paymentAccount('en', () => {})).toEqual(tablePaymentAccount());
    const calls = f.fetcher.mock.calls.filter(([url]) => url.includes('/table-payments/account?'));
    expect(calls).toHaveLength(1);
    expect(calls[0]![1].headers?.['X-Session-Id']).toBe(tenantB);
    expect(
      [...f.store.values.keys()].some((key) =>
        /basket-operation|order-operation-proof|table-round-operation/.test(key),
      ),
    ).toBe(false);
    expect((await f.actor.saved())?.serviceSessionId).toBe(tenantA);
  },
);
it('reuses an existing canonical session without generating or replacing identity', async () => {
  const f = await fixture();
  await f.repository.vault.saveCapability(f.context, 'guest-session', f.principal, tenantA);
  expect(await f.actor.paymentAccount('en', () => {})).toEqual(tablePaymentAccount());
  expect(f.createId).not.toHaveBeenCalled();
  expect(f.fetcher.mock.calls.at(-1)![1].headers?.['X-Session-Id']).toBe(tenantA);
});
it('refuses a malformed existing correlation instead of silently replacing it', async () => {
  const f = await fixture();
  await f.repository.vault.saveCapability(
    f.context,
    'guest-session',
    f.principal,
    'legacy-not-canonical',
  );
  await expect(f.actor.paymentAccount('en', () => {})).rejects.toThrow();
  expect(f.createId).not.toHaveBeenCalled();
  expect(await f.repository.vault.capability(f.context, 'guest-session', f.principal)).toBe(
    'legacy-not-canonical',
  );
  expect(f.fetcher.mock.calls.some(([url]) => url.includes('/table-payments/account?'))).toBe(
    false,
  );
});
it('preserves an interrupted basket installation and its original correlation for normal recovery', async () => {
  const f = await fixture();
  const key = secretKey(f.context, 'basket-operation', f.principal);
  const original = {
    schemaVersion: 1,
    request: { productId: tenantA, quantity: 2 },
    environment: f.context.environment,
    tenantId: tenantA,
    principal: f.principal,
    sessionId: tenantA,
    operationId: tenantB,
    phase: 'installing',
  };
  const wire = JSON.stringify(original);
  await f.store.set(key, wire);
  await expect(f.actor.paymentAccount('en', () => {})).rejects.toThrow();
  expect(f.createId).not.toHaveBeenCalled();
  expect(f.store.values.get(key)).toBe(wire);
  expect(await f.repository.vault.capability(f.context, 'guest-session', f.principal)).toBeNull();
  const restored = await f.repository.baskets.load(f.context, f.principal, () => {});
  expect(restored?.sessionId).toBe(tenantA);
  expect(restored?.operationId).toBe(tenantB);
  expect(restored?.phase).toBe('ready');
  expect(await f.actor.paymentAccount('en', () => {})).toEqual(tablePaymentAccount());
  expect(f.fetcher.mock.calls.at(-1)![1].headers?.['X-Session-Id']).toBe(tenantA);
});
it('acknowledges a new local correlation before reporting it saved', async () => {
  const f = await fixture();
  const set = f.store.set.bind(f.store);
  jest
    .spyOn(f.store, 'set')
    .mockImplementation((key, value) =>
      key.endsWith('.guest-session') ? Promise.resolve() : set(key, value),
    );
  await expect(
    f.repository.tableVisits.paymentSession(f.context, f.visit, f.createId, () => {}),
  ).rejects.toThrow();
  expect(f.store.values.has(secretKey(f.context, 'guest-session', f.principal))).toBe(false);
  expect((await f.actor.saved())?.serviceSessionId).toBe(tenantA);
});
it.each(['leave', 'logout', 'view'])(
  'withdraws late private response publication: %s',
  async (changed) => {
    const f = await fixture(true);
    const entered = deferred<void>();
    const release = deferred<void>();
    const original = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async (...args) => {
      if (args[0].includes('/table-payments/account?')) {
        entered.resolve();
        await release.promise;
      }
      return original(...args);
    });
    let visible = true;
    const pending = f.actor.paymentAccount('en', () => {
      if (!visible) throw new Error('View withdrawn');
    });
    await entered.promise;
    if (changed === 'leave') await f.actor.leave(tenantA);
    if (changed === 'logout') await f.controller.logout();
    if (changed === 'view') visible = false;
    release.resolve();
    await expect(pending).rejects.toThrow();
    expect(
      f.fetcher.mock.calls.filter(([url]) => url.includes('/table-payments/account?')),
    ).toHaveLength(1);
  },
);
it('rejects a replaced or expired visit before creating local session identity', async () => {
  const f = await fixture();
  await f.actor.leave(tenantA);
  await expect(
    f.repository.tableVisits.paymentSession(f.context, f.visit, f.createId, () => {}),
  ).rejects.toThrow();
  expect(f.createId).not.toHaveBeenCalled();
});
