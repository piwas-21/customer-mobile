import {
  accountDeletionSchema,
  readAccountDeletion,
  requestAccountDeletion,
} from './accountDeletion';
import { authResponse, session, sessionSetup } from '../test/sessions';
import { response } from '../test/transport';
import { tenantA, tenantB } from '../test/fixtures';
import { deferred } from '../test/deferred';
const notRequested = { schemaVersion: 1, state: 'not-requested', scheduledAtUtc: null };
const scheduled = { schemaVersion: 1, state: 'scheduled', scheduledAtUtc: '2026-11-18T13:20:00Z' };
it('reads status and sends only a versioned owner-derived request', async () => {
  const { controller, fetcher } = await sessionSetup();
  fetcher
    .mockResolvedValueOnce(response({ success: true, data: notRequested }))
    .mockResolvedValueOnce(response({ success: true, data: scheduled }));
  await expect(readAccountDeletion(controller, tenantA)).resolves.toEqual(notRequested);
  await expect(requestAccountDeletion(controller, tenantA, 'fr')).resolves.toEqual(scheduled);
  expect(
    fetcher.mock.calls.map(([url, options]) => ({
      url,
      method: options.method,
      body: options.body,
    })),
  ).toEqual([
    {
      url: 'https://alpha.example/api/customer-mobile/account/deletion',
      method: 'GET',
      body: undefined,
    },
    {
      url: 'https://alpha.example/api/customer-mobile/account/deletion/request',
      method: 'POST',
      body: '{"schemaVersion":1}',
    },
  ]);
  expect(fetcher.mock.calls[1]?.[1].headers).toMatchObject({
    Authorization: 'Bearer old-access',
    'Accept-Language': 'fr',
  });
});
it.each([401, 403, 409, 429, 503])(
  'never refreshes or retries a deletion POST after HTTP %s',
  async (status) => {
    const { controller, fetcher, repository, context } = await sessionSetup();
    fetcher.mockResolvedValue(response({}, status));
    await expect(requestAccountDeletion(controller, tenantA, 'en')).rejects.toMatchObject({
      status,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await repository.load(context)).toEqual(session);
  },
);
it('renews only the status read after a definitive expired credential response', async () => {
  const { controller, fetcher } = await sessionSetup();
  fetcher
    .mockResolvedValueOnce(response({}, 401))
    .mockResolvedValueOnce(authResponse())
    .mockResolvedValueOnce(response({ success: true, data: scheduled }));
  await expect(readAccountDeletion(controller, tenantA)).resolves.toEqual(scheduled);
  expect(fetcher.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
    '/api/customer-mobile/account/deletion',
    '/api/Auth/refresh-token',
    '/api/customer-mobile/account/deletion',
  ]);
});
it.each([
  { ...scheduled, schemaVersion: 2 },
  { ...scheduled, state: 'done' },
  { ...scheduled, scheduledAtUtc: null },
  { ...scheduled, scheduledAtUtc: '2026-11-18T14:20:00+01:00' },
  { ...notRequested, scheduledAtUtc: scheduled.scheduledAtUtc },
  { ...scheduled, email: 'private@example.test' },
])('refuses unsupported, contradictory or private response fields %j', (data) => {
  expect(accountDeletionSchema.safeParse(data).success).toBe(false);
});
it('refuses a foreign principal before dispatch', async () => {
  const { controller, fetcher } = await sessionSetup();
  await expect(requestAccountDeletion(controller, tenantB, 'en')).rejects.toMatchObject({
    reason: 'refused',
  });
  expect(fetcher).not.toHaveBeenCalled();
});
it('rechecks the owner after an asynchronous secure credential read before posting', async () => {
  const { controller, fetcher, repository } = await sessionSetup();
  const loaded = deferred<typeof session>();
  jest.spyOn(repository.vault, 'session').mockReturnValueOnce(loaded.promise);
  const pending = requestAccountDeletion(controller, tenantA, 'en');
  await controller.logout();
  loaded.resolve(session);
  await expect(pending).rejects.toMatchObject({ reason: 'refused' });
  expect(fetcher).not.toHaveBeenCalled();
});
