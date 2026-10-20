import { requestRegistration, requestRecovery, requestVerification } from './accountRequests';
import { sessionSetup } from '../test/sessions';
import { response } from '../test/transport';
import { nativeBootstrapResponse } from '../test/nativeAccounts';
const registration = {
  email: ' new@example.test ',
  firstName: ' New ',
  lastName: ' Guest ',
  password: 'Str0ng!Passw0rd',
  confirmPassword: 'Str0ng!Passw0rd',
};
it('uses versioned native registration without credentials or accepting a returned session', async () => {
  const { client, context, fetcher, repository } = await sessionSetup(false);
  fetcher
    .mockResolvedValueOnce(nativeBootstrapResponse())
    .mockResolvedValueOnce(response({ success: true, data: 'ack' }));
  expect(
    await requestRegistration(client, context, registration, 'fr', () => undefined),
  ).toBeUndefined();
  expect(fetcher.mock.calls[1]?.[0]).toBe(
    'https://alpha.example/api/customer-mobile/auth/register',
  );
  expect(fetcher.mock.calls[1]?.[1].headers).not.toHaveProperty('Authorization');
  expect(fetcher.mock.calls[1]?.[1].headers).toHaveProperty('Accept-Language', 'fr');
  expect(JSON.parse(fetcher.mock.calls[1]?.[1].body ?? '{}')).toEqual({
    ...registration,
    schemaVersion: 1,
    email: 'new@example.test',
    firstName: 'New',
    lastName: 'Guest',
  });
  expect(await repository.load(context)).toBeNull();
});
it('refuses weak, mismatching or overlong native registration before any network dispatch', async () => {
  const { client, context, fetcher } = await sessionSetup(false);
  for (const input of [
    { ...registration, password: 'weak' },
    { ...registration, confirmPassword: 'different' },
    { ...registration, password: 'Ab1!'.repeat(251), confirmPassword: 'Ab1!'.repeat(251) },
  ])
    await expect(
      requestRegistration(client, context, input, 'en', () => undefined),
    ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([
  ['recovery', requestRecovery, 'request-password-reset'],
  ['verification', requestVerification, 'request-verification'],
] as const)(
  'requests %s with only a normalized versioned email and generic acknowledgement',
  async (_name, send, path) => {
    const { client, context, fetcher } = await sessionSetup();
    fetcher
      .mockResolvedValueOnce(nativeBootstrapResponse())
      .mockResolvedValueOnce(
        response({ success: true, data: 'do not display arbitrary server wording' }),
      );
    expect(
      await send(client, context, { email: ' guest@example.test ' }, 'en', () => undefined),
    ).toBeUndefined();
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      'https://alpha.example/api/customer-mobile/auth/' + path,
    );
    expect(fetcher.mock.calls[1]?.[1].body).toBe(
      '{"schemaVersion":1,"email":"guest@example.test"}',
    );
    expect(fetcher.mock.calls[1]?.[1].headers).not.toHaveProperty('Authorization');
  },
);
it('does not retry an email write after an unknown network outcome', async () => {
  const { client, context, fetcher } = await sessionSetup(false);
  fetcher
    .mockResolvedValueOnce(nativeBootstrapResponse())
    .mockRejectedValueOnce(new Error('Offline'));
  await expect(
    requestRecovery(client, context, { email: 'guest@example.test' }, 'en', () => undefined),
  ).rejects.toMatchObject({ reason: 'network' });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
