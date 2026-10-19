import { profileEditSchema, updateProfile } from './profile';
import { sessionSetup, session, authResponse } from '../test/sessions';
import { customerProfile } from '../test/customerProfile';
import { response } from '../test/transport';
import { tenantA, tenantB } from '../test/fixtures';
import { deferred } from '../test/deferred';
const input = { firstName: 'Alex', lastName: 'Guest', phoneNumber: '' };

it('sends only explicit profile fields and confirms removal through the owned server result', async () => {
  const { controller, fetcher } = await sessionSetup();
  fetcher.mockResolvedValue(response({ success: true, data: customerProfile }));
  await expect(
    updateProfile(controller, tenantA, { ...input, firstName: '  Alex  ' }, 'fr'),
  ).resolves.toEqual(customerProfile);
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
    method: 'PUT',
    body: JSON.stringify(input),
    headers: { Authorization: 'Bearer old-access', 'Accept-Language': 'fr' },
  });
  expect(fetcher.mock.calls[0]?.[1].headers).not.toHaveProperty('X-Session-Id');
});

it.each([
  { firstName: '' },
  { lastName: ' '.repeat(2) },
  { firstName: 'a'.repeat(101) },
  { phoneNumber: '012345' },
  { phoneNumber: 'bad' },
  { phoneNumber: '+1234567890123456' },
  { metadata: { internal: 'change' } },
])('refuses invalid or extra fields before dispatch %j', async (override) => {
  const { controller, fetcher } = await sessionSetup();
  await expect(
    updateProfile(controller, tenantA, { ...input, ...override }, 'en'),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([
  { id: tenantB },
  { firstName: 'Not saved' },
  { lastName: 'Not saved' },
  { phoneNumber: '+41791234567' },
  { role: 'Admin' },
  { isDeleted: true },
])('does not announce an unconfirmed or unowned update %j', async (override) => {
  const { controller, fetcher } = await sessionSetup();
  fetcher.mockResolvedValue(response({ success: true, data: { ...customerProfile, ...override } }));
  await expect(updateProfile(controller, tenantA, input, 'en')).rejects.toMatchObject({
    reason: 'contract',
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each([401, 403, 429, 503])('does not refresh or retry a PUT on HTTP %s', async (status) => {
  const { controller, fetcher, repository, context } = await sessionSetup();
  fetcher.mockResolvedValue(response({}, status));
  await expect(updateProfile(controller, tenantA, input, 'en')).rejects.toMatchObject({ status });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(await repository.load(context)).toEqual(session);
});

it('prevents dispatch from the prior login after logout and same-customer sign-in', async () => {
  const { controller, fetcher, repository } = await sessionSetup();
  const loaded = deferred<typeof session>();
  jest.spyOn(repository.vault, 'session').mockReturnValueOnce(loaded.promise);
  const pending = updateProfile(controller, tenantA, input, 'en');
  await controller.logout();
  fetcher.mockResolvedValue(authResponse());
  await controller.login({ email: 'customer@example.test', password: 'password' }, 'en');
  loaded.resolve(session);
  await expect(pending).rejects.toMatchObject({ reason: 'refused' });
  expect(fetcher.mock.calls.map(([, options]) => options.method)).toEqual(['POST']);
});

it.each(['+41791234567', '41791234567'])('supports the server phone shape %s', (phoneNumber) => {
  expect(profileEditSchema.parse({ ...input, phoneNumber }).phoneNumber).toBe(phoneNumber);
});
