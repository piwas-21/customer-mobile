import { signIn, refreshSession } from './auth';
import { response, setup } from '../test/transport';
import { tenantA, tenantB } from '../test/fixtures';
const session = { userId: tenantA, accessToken: 'issued-access', refreshToken: 'issued-refresh' };
it('signs in without a stale bearer and returns only the credential pair and principal', async () => {
  const { client, context, fetcher, vault } = setup();
  await vault.saveSession(context, { ...session, accessToken: 'stale-access' });
  fetcher.mockResolvedValue(
    response({
      success: true,
      data: { ...session, role: 'Customer', email: 'private@example.test' },
    }),
  );
  expect(
    await signIn(client, context, { email: ' guest@example.test ', password: 'password' }, 'fr'),
  ).toEqual(session);
  expect(fetcher.mock.calls[0]?.[1].headers).not.toHaveProperty('Authorization');
  expect(fetcher.mock.calls[0]?.[1].headers).toHaveProperty('Accept-Language', 'fr');
  expect(JSON.parse(fetcher.mock.calls[0]?.[1].body ?? '{}')).toEqual({
    email: 'guest@example.test',
    password: 'password',
  });
});
it.each(['Admin', 'Server', 'Unknown'])(
  'rejects %s credentials in the customer app',
  async (role) => {
    const { client, context, fetcher } = setup();
    fetcher.mockResolvedValue(response({ success: true, data: { ...session, role } }));
    await expect(
      signIn(client, context, { email: 'guest@example.test', password: 'password' }, 'en'),
    ).rejects.toMatchObject({ reason: 'contract' });
  },
);
it('validates login input before dispatch', async () => {
  const { client, context, fetcher } = setup();
  await expect(signIn(client, context, { email: 'invalid', password: '' }, 'en')).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
it('refreshes only the captured principal and never attaches a stale bearer', async () => {
  const { client, context, fetcher } = setup();
  fetcher
    .mockResolvedValueOnce(
      response({
        success: true,
        data: { ...session, role: 'Customer', accessToken: 'new-access' },
      }),
    )
    .mockResolvedValueOnce(
      response({ success: true, data: { ...session, userId: tenantB, role: 'Customer' } }),
    );
  expect(await refreshSession(client, context, session)).toEqual({
    ...session,
    accessToken: 'new-access',
  });
  expect(fetcher.mock.calls[0]?.[1].headers).not.toHaveProperty('Authorization');
  expect(JSON.parse(fetcher.mock.calls[0]?.[1].body ?? '{}')).toEqual({
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  });
  await expect(refreshSession(client, context, session)).rejects.toMatchObject({
    reason: 'contract',
  });
});
it('captures refresh identity and token values before asynchronous dispatch', async () => {
  const { client, context, fetcher } = setup();
  const mutable = { ...session };
  fetcher.mockResolvedValue(response({ success: true, data: { ...session, role: 'Customer' } }));
  const pending = refreshSession(client, context, mutable);
  mutable.userId = tenantB;
  mutable.accessToken = 'other-access';
  mutable.refreshToken = 'other-refresh';
  expect(await pending).toEqual(session);
  expect(JSON.parse(fetcher.mock.calls[0]?.[1].body ?? '{}')).toEqual({
    accessToken: 'issued-access',
    refreshToken: 'issued-refresh',
  });
});
