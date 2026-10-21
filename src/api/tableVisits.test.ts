import { joinTableVisit, readTableAccount } from './tableVisits';
import { setup, response } from '../test/transport';
import { tableAccount, tableIdentity, tableVisitRecord } from '../test/tableAccount';
import { tenantA, tenantB } from '../test/fixtures';
import { bootstrapSchema } from '../core/capabilities';
import { session } from '../test/sessions';
import { tableAccountSchema } from './tableAccountContract';
const config = () =>
  bootstrapSchema.parse({
    schemaVersion: 1,
    tenantId: tenantA,
    currency: 'CHF',
    locale: 'fr',
    timezone: 'Europe/Zurich',
    lifecycle: 'active',
    compatibility: 'supported',
    modules: ['server'],
    flags: { tableGuestVisitsV1: true },
    capabilities: { 'table-visits': 'enabled' },
  });
const guard = () => {};
it('joins anonymously only after explicit caller action and preserves the exact QR input', async () => {
  const f = setup();
  f.fetcher.mockResolvedValue(response({ success: true, data: tableIdentity }));
  expect(
    await joinTableVisit(f.client, f.context, config(), 'opaque-table-qr', guard, 'fr'),
  ).toEqual(tableIdentity);
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  const [url, wire] = f.fetcher.mock.calls[0]!;
  expect(url).toContain('/api/table-guest-visits/join');
  expect(JSON.parse(wire.body!)).toEqual({ qrCodeData: 'opaque-table-qr' });
  expect(wire.headers).not.toHaveProperty('Authorization');
  expect(wire.headers).not.toHaveProperty('X-Session-Id');
  expect(wire.headers).not.toHaveProperty('X-Table-Participant');
});
it('reads the exact visit with only its participant credential, without a basket session or Customer JWT', async () => {
  const f = setup();
  await f.vault.saveSession(f.context, session);
  await f.vault.saveCapability(
    f.context,
    'table-participant',
    tableVisitRecord().principal,
    JSON.stringify(tableVisitRecord()),
  );
  f.fetcher.mockResolvedValue(response({ success: true, data: tableAccount() }));
  expect(
    await readTableAccount(f.client, f.context, config(), tableVisitRecord(), guard, 'fr'),
  ).toEqual(tableAccount());
  const [url, wire] = f.fetcher.mock.calls[0]!;
  expect(url).toContain('/' + tenantA + '/account');
  expect(wire.method).toBe('GET');
  expect(wire.headers?.['X-Table-Participant']).toBe(tableIdentity.participantToken);
  expect(wire.headers).not.toHaveProperty('X-Session-Id');
  expect(wire.headers).not.toHaveProperty('Authorization');
  expect(wire.body).toBeUndefined();
});
it.each(['disabled', 'unavailable', 'unknown', 'flag', 'tenant', 'lifecycle'])(
  'refuses new native table access before I/O when configuration is %s',
  async (mode) => {
    const f = setup();
    const bootstrap = config();
    if (['disabled', 'unavailable', 'unknown'].includes(mode))
      bootstrap.capabilities['table-visits'] = mode as 'disabled' | 'unavailable' | 'unknown';
    if (mode === 'flag') bootstrap.flags.tableGuestVisitsV1 = false;
    if (mode === 'tenant') bootstrap.tenantId = tenantB;
    if (mode === 'lifecycle') bootstrap.lifecycle = 'read-only';
    await expect(
      joinTableVisit(f.client, f.context, bootstrap, 'qr', guard, 'fr'),
    ).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
it.each(['missing', 'replaced', 'expired', 'foreign-owner', 'wrong-path', 'write', 'body'])(
  'refuses unauthorized table account transport before I/O: %s',
  async (mode) => {
    const f = setup();
    if (mode !== 'missing')
      await f.vault.saveCapability(
        f.context,
        'table-participant',
        tableVisitRecord().principal,
        JSON.stringify(
          mode === 'replaced'
            ? {
                ...tableVisitRecord(),
                identity: { ...tableIdentity, participantToken: 'B'.repeat(42) + 'A' },
              }
            : tableVisitRecord(),
        ),
      );
    const input = {
      ...tableVisitRecord(),
      identity: {
        ...tableIdentity,
        ...(mode === 'expired' ? { expiresAt: '2000-01-01T00:00:00Z' } : {}),
      },
    };
    await expect(
      f.client.request(
        f.context,
        '/api/table-guest-visits/' + (mode === 'wrong-path' ? tenantB : tenantA) + '/account',
        tableAccountSchema,
        {
          method: mode === 'write' ? 'POST' : 'GET',
          credentials: 'table-account',
          principal: { kind: 'guest', id: mode === 'foreign-owner' ? 'foreign' : 'basket' },
          expectedTableVisit: input,
          assertCurrent: guard,
          ...(mode === 'body' ? { body: {} } : {}),
        },
      ),
    ).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
it('refuses a different returned visit and expired admission without silently repeating either request', async () => {
  const f = setup();
  await f.vault.saveCapability(
    f.context,
    'table-participant',
    tableVisitRecord().principal,
    JSON.stringify(tableVisitRecord()),
  );
  f.fetcher.mockResolvedValue(
    response({ success: true, data: { ...tableAccount(), serviceSessionId: tenantB } }),
  );
  await expect(
    readTableAccount(f.client, f.context, config(), tableVisitRecord(), guard, 'fr'),
  ).rejects.toMatchObject({ reason: 'contract' });
  f.fetcher.mockResolvedValue(
    response({ success: true, data: { ...tableIdentity, expiresAt: '2000-01-01T00:00:00Z' } }),
  );
  await expect(
    joinTableVisit(f.client, f.context, config(), 'qr', guard, 'fr'),
  ).rejects.toMatchObject({ reason: 'contract' });
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});
