import { readTableAccount } from '../api/tableVisits';
import { tableAccount, tableVisitRecord } from '../test/tableAccount';
import { setup, response } from '../test/transport';
import { bootstrapSchema } from './capabilities';
import { deferred } from '../test/deferred';
import { tenantA, tenantB } from '../test/fixtures';
import { tableAccountSchema } from '../api/tableAccountContract';
const bootstrap = () =>
  bootstrapSchema.parse({
    schemaVersion: 1,
    tenantId: tenantA,
    currency: 'CHF',
    locale: 'fr',
    timezone: 'Europe/Zurich',
    lifecycle: 'active',
    compatibility: 'supported',
    modules: [],
    flags: { tableGuestVisitsV1: true },
    capabilities: { 'table-visits': 'enabled' },
  });
it.each(['guest', 'customer'] as const)(
  'keeps participant authorization independent of %s account/session credentials',
  async (kind) => {
    const f = setup();
    const record = {
      ...tableVisitRecord(),
      principal: { kind, id: kind === 'customer' ? tenantB : 'basket' },
    };
    await f.vault.saveCapability(
      f.context,
      'table-participant',
      record.principal,
      JSON.stringify(record),
    );
    f.fetcher.mockResolvedValue(response({ success: true, data: tableAccount() }));
    expect(
      await readTableAccount(f.client, f.context, bootstrap(), record, () => {}, 'fr'),
    ).toEqual(tableAccount());
    expect(f.fetcher.mock.calls[0]![1].headers).not.toHaveProperty('Authorization');
    expect(f.fetcher.mock.calls[0]![1].headers).not.toHaveProperty('X-Session-Id');
  },
);
it('captures the exact visit and participant before a delayed secure read despite later caller mutation', async () => {
  const f = setup();
  const record = tableVisitRecord();
  await f.vault.saveCapability(
    f.context,
    'table-participant',
    record.principal,
    JSON.stringify(record),
  );
  const entered = deferred<void>();
  const release = deferred<void>();
  const read = f.vault.capability.bind(f.vault);
  jest.spyOn(f.vault, 'capability').mockImplementation(async (...args) => {
    entered.resolve();
    await release.promise;
    return read(...args);
  });
  f.fetcher.mockResolvedValue(response({ success: true, data: tableAccount() }));
  const pending = readTableAccount(f.client, f.context, bootstrap(), record, () => {}, 'fr');
  await entered.promise;
  record.identity.serviceSessionId = tenantB;
  record.identity.participantToken = 'B'.repeat(42) + 'A';
  record.principal.id = 'different';
  release.resolve();
  await expect(pending).resolves.toEqual(tableAccount());
  expect(f.fetcher.mock.calls[0]![0]).toContain('/' + tenantA + '/account');
  expect(f.fetcher.mock.calls[0]![1].headers?.['X-Table-Participant']).toBe('A'.repeat(43));
});
it('withdraws a paused private header read before dispatch when its original owner leaves', async () => {
  const f = setup();
  const record = tableVisitRecord();
  await f.vault.saveCapability(
    f.context,
    'table-participant',
    record.principal,
    JSON.stringify(record),
  );
  const entered = deferred<void>();
  const release = deferred<void>();
  const read = f.vault.capability.bind(f.vault);
  let active = true;
  jest.spyOn(f.vault, 'capability').mockImplementation(async (...args) => {
    entered.resolve();
    await release.promise;
    return read(...args);
  });
  const pending = readTableAccount(
    f.client,
    f.context,
    bootstrap(),
    record,
    () => {
      if (!active) throw new Error('Owner withdrawn');
    },
    'fr',
  );
  await entered.promise;
  active = false;
  release.resolve();
  await expect(pending).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
});
it('does not send an expected table credential through another credential mode', async () => {
  const f = setup();
  await expect(
    f.client.request(
      f.context,
      '/api/table-guest-visits/' + tenantA + '/account',
      tableAccountSchema,
      {
        method: 'GET',
        credentials: 'none',
        expectedTableVisit: tableVisitRecord(),
        assertCurrent: () => {},
      },
    ),
  ).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
});
