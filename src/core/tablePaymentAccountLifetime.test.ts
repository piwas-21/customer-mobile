import { readTablePaymentAccount } from '../api/tablePaymentAccount';
import {
  tablePaymentAccount,
  tablePaymentReadFixture,
  paymentReadSession,
} from '../test/tablePaymentAccount';
import { response } from '../test/transport';
import { tenantA, tenantB } from '../test/fixtures';
import { deferred } from '../test/deferred';

it('rechecks the saved participant after a paused JWT read before sending any headers', async () => {
  const f = await tablePaymentReadFixture(true);
  const entered = deferred<void>();
  const release = deferred<void>();
  const original = f.vault.session.bind(f.vault);
  jest.spyOn(f.vault, 'session').mockImplementation(async (...args) => {
    entered.resolve();
    await release.promise;
    return original(...args);
  });
  const pending = readTablePaymentAccount(
    f.client,
    f.context,
    f.bootstrap,
    f.scope,
    () => {},
    'en',
  );
  await entered.promise;
  await f.vault.saveCapability(
    f.context,
    'table-participant',
    f.scope.visit.principal,
    JSON.stringify({
      ...f.scope.visit,
      identity: { ...f.scope.visit.identity, participantToken: 'B'.repeat(42) + 'A' },
    }),
  );
  release.resolve();
  await expect(pending).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
});
it('captures the original wire scope before caller mutation during a secure read', async () => {
  const f = await tablePaymentReadFixture(true);
  const entered = deferred<void>();
  const release = deferred<void>();
  const original = f.vault.session.bind(f.vault);
  jest.spyOn(f.vault, 'session').mockImplementation(async (...args) => {
    entered.resolve();
    await release.promise;
    return original(...args);
  });
  const pending = readTablePaymentAccount(
    f.client,
    f.context,
    f.bootstrap,
    f.scope,
    () => {},
    'en',
  );
  await entered.promise;
  f.scope.sessionId = tenantA;
  f.scope.visit.identity.serviceSessionId = tenantB;
  f.scope.visit.identity.participantToken = 'B'.repeat(42) + 'A';
  release.resolve();
  await expect(pending).resolves.toEqual(tablePaymentAccount());
  expect(f.fetcher.mock.calls[0]![0]).toContain('serviceSessionId=' + tenantA);
  expect(f.fetcher.mock.calls[0]![1].headers?.['X-Session-Id']).toBe(paymentReadSession);
});
it('withholds a late response after the original participant expires during the request', async () => {
  const f = await tablePaymentReadFixture();
  const entered = deferred<void>();
  const release = deferred<void>();
  f.fetcher.mockImplementation(async () => {
    entered.resolve();
    await release.promise;
    return response({ success: true, data: tablePaymentAccount() });
  });
  const pending = readTablePaymentAccount(
    f.client,
    f.context,
    f.bootstrap,
    f.scope,
    () => {},
    'en',
  );
  await entered.promise;
  const clock = jest
    .spyOn(Date, 'now')
    .mockReturnValue(Date.parse(f.scope.visit.identity.expiresAt) + 1);
  try {
    release.resolve();
    await expect(pending).rejects.toThrow();
  } finally {
    clock.mockRestore();
    release.resolve();
  }
});
