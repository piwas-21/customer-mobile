import { requestRegistration, requestRecovery } from './accountRequests';
import { sessionSetup, authResponse } from '../test/sessions';
import { response } from '../test/transport';
const registration = {
  email: ' new@example.test ',
  firstName: ' New ',
  lastName: ' Guest ',
  password: 'Str0ng!Passw0rd',
  confirmPassword: 'Str0ng!Passw0rd',
};
it('registers without bearer credentials, captures locale and discards every returned token', async () => {
  const { client, context, fetcher, repository } = await sessionSetup(false);
  fetcher.mockResolvedValue(authResponse());
  expect(await requestRegistration(client, context, registration, 'fr')).toBeUndefined();
  expect(fetcher.mock.calls[0]?.[1].headers).not.toHaveProperty('Authorization');
  expect(fetcher.mock.calls[0]?.[1].headers).toHaveProperty('Accept-Language', 'fr');
  expect(JSON.parse(fetcher.mock.calls[0]?.[1].body ?? '{}')).toEqual({
    ...registration,
    email: 'new@example.test',
    firstName: 'New',
    lastName: 'Guest',
  });
  expect(await repository.load(context)).toBeNull();
});
it('refuses weak or mismatching registration before dispatch', async () => {
  const { client, context, fetcher } = await sessionSetup(false);
  await expect(
    requestRegistration(client, context, { ...registration, password: 'weak' }, 'en'),
  ).rejects.toThrow();
  await expect(
    requestRegistration(client, context, { ...registration, confirmPassword: 'different' }, 'en'),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
it('sends only a normalized recovery email and ignores the server wording', async () => {
  const { client, context, fetcher } = await sessionSetup();
  fetcher.mockResolvedValue(
    response({ success: true, data: 'do not display arbitrary server wording' }),
  );
  expect(
    await requestRecovery(client, context, { email: ' guest@example.test ' }, 'en'),
  ).toBeUndefined();
  expect(fetcher.mock.calls[0]?.[1].body).toBe('{"email":"guest@example.test"}');
  expect(fetcher.mock.calls[0]?.[1].headers).not.toHaveProperty('Authorization');
});
it('does not retry a recovery request with an unknown network outcome', async () => {
  const { client, context, fetcher } = await sessionSetup(false);
  fetcher.mockRejectedValue(new Error('Offline'));
  await expect(
    requestRecovery(client, context, { email: 'guest@example.test' }, 'en'),
  ).rejects.toMatchObject({ reason: 'network' });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
