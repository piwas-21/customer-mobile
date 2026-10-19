import { readProfile } from './profile';
import { tenantA, tenantB } from '../test/fixtures';
import { sessionSetup, authResponse } from '../test/sessions';
import { response } from '../test/transport';
import { customerProfile as profile } from '../test/customerProfile';
it('reads only the signed-in customer profile and strips internal metadata', async () => {
  const { controller, fetcher } = await sessionSetup();
  fetcher.mockResolvedValue(
    response({ success: true, data: { ...profile, metadata: { internal: 'private' } } }),
  );
  expect(await readProfile(controller, tenantA)).toEqual(profile);
  expect(fetcher.mock.calls[0]?.[0]).toBe('https://alpha.example/api/User/profile');
  expect(fetcher.mock.calls[0]?.[1].headers).toHaveProperty('Authorization', 'Bearer old-access');
});
it.each([{ id: tenantB }, { role: 'Admin' }, { isDeleted: true }])(
  'rejects an unauthorized profile %s',
  async (override) => {
    const { controller, fetcher } = await sessionSetup();
    fetcher.mockResolvedValue(response({ success: true, data: { ...profile, ...override } }));
    await expect(readProfile(controller, tenantA)).rejects.toMatchObject({ reason: 'contract' });
  },
);
it('rejects an old controller after its scope is disposed', async () => {
  const { controller, fetcher } = await sessionSetup(false);
  fetcher.mockResolvedValue(authResponse());
  const login = controller.login({ email: 'guest@example.test', password: 'password' }, 'en');
  controller.dispose();
  await expect(login).rejects.toMatchObject({ reason: 'refused' });
  expect(fetcher).not.toHaveBeenCalled();
});
