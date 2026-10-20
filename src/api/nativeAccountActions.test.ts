import { completeNativeAccountAction, requireNativeAccountActions } from './nativeAccountActions';
import { requestRegistration, requestRecovery, requestVerification } from './accountRequests';
import { sessionSetup } from '../test/sessions';
import {
  nativeAccountBootstrap,
  nativeBootstrapResponse,
  nativeAccountProof,
} from '../test/nativeAccounts';
import { tenantB } from '../test/fixtures';
import { response } from '../test/transport';
import { deferred } from '../test/deferred';
const password = { newPassword: 'Str0ng!Passw0rd', confirmPassword: 'Str0ng!Passw0rd' };
it.each(['verify', 'recover'] as const)(
  'completes %s only with a fresh tenant capability and a private POST body',
  async (action) => {
    const { client, context, fetcher, repository } = await sessionSetup(false);
    fetcher
      .mockResolvedValueOnce(nativeBootstrapResponse())
      .mockResolvedValueOnce(response({ success: true, data: 'ack' }));
    expect(
      await completeNativeAccountAction(
        client,
        context,
        action,
        nativeAccountProof,
        'fr',
        () => undefined,
        password,
      ),
    ).toBeUndefined();
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://alpha.example/api/tenant/mobile/bootstrap?contractVersion=1',
    );
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      'https://alpha.example/api/customer-mobile/auth/' +
        (action === 'verify' ? 'verify' : 'reset-password'),
    );
    expect(JSON.parse(fetcher.mock.calls[1]?.[1].body ?? '{}')).toEqual({
      schemaVersion: 1,
      proof: nativeAccountProof,
      ...(action === 'recover' ? password : {}),
    });
    expect(fetcher.mock.calls[1]?.[1].headers).not.toHaveProperty('Authorization');
    expect(fetcher.mock.calls[1]?.[1].headers).not.toHaveProperty('X-Session-Id');
    expect(await repository.load(context)).toBeNull();
  },
);
it.each([
  { flags: {} },
  { flags: { nativeAccountLinksV1: false } },
  { capabilities: { accounts: 'disabled' } },
  { lifecycle: 'read-only' },
  { compatibility: 'update-required' },
  { tenantId: tenantB },
])(
  'refuses a withdrawn or incompatible native-account capability before proof dispatch',
  async (override) => {
    const { client, context, fetcher } = await sessionSetup(false);
    fetcher.mockResolvedValue(nativeBootstrapResponse({ ...nativeAccountBootstrap, ...override }));
    await expect(
      completeNativeAccountAction(
        client,
        context,
        'verify',
        nativeAccountProof,
        'en',
        () => undefined,
      ),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1].body).toBeUndefined();
  },
);
it('never falls back to web email aliases when the native gate is missing', async () => {
  const { client, context, fetcher } = await sessionSetup(false);
  fetcher.mockResolvedValue(nativeBootstrapResponse({ ...nativeAccountBootstrap, flags: {} }));
  const email = { email: 'guest@example.test' };
  for (const send of [requestRecovery, requestVerification])
    await expect(send(client, context, email, 'en', () => undefined)).rejects.toThrow();
  await expect(
    requestRegistration(
      client,
      context,
      {
        ...email,
        firstName: 'First',
        lastName: 'Last',
        password: password.newPassword,
        confirmPassword: password.confirmPassword,
      },
      'en',
      () => undefined,
    ),
  ).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(fetcher.mock.calls.every(([url]) => url.includes('/mobile/bootstrap'))).toBe(true);
});
it('refuses malformed proofs/passwords before I/O and does not repeat an ambiguous completion', async () => {
  const { client, context, fetcher } = await sessionSetup(false);
  await expect(
    completeNativeAccountAction(client, context, 'verify', 'short', 'en', () => undefined),
  ).rejects.toThrow();
  await expect(
    completeNativeAccountAction(
      client,
      context,
      'recover',
      nativeAccountProof,
      'en',
      () => undefined,
      {
        ...password,
        confirmPassword: 'wrong',
      },
    ),
  ).rejects.toThrow();
  await expect(
    completeNativeAccountAction(
      client,
      context,
      'recover',
      nativeAccountProof,
      'en',
      () => undefined,
      {
        newPassword: 'Ab1!'.repeat(251),
        confirmPassword: 'Ab1!'.repeat(251),
      },
    ),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  fetcher
    .mockResolvedValueOnce(nativeBootstrapResponse())
    .mockRejectedValueOnce(new Error('lost response'));
  await expect(
    completeNativeAccountAction(
      client,
      context,
      'recover',
      nativeAccountProof,
      'en',
      () => undefined,
      password,
    ),
  ).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('withdraws a completion when tenant selection changes during the fresh bootstrap read', async () => {
  const { client, context, fetcher, boundary } = await sessionSetup(false);
  const pending = deferred<Response>();
  fetcher.mockReturnValueOnce(pending.promise);
  const operation = completeNativeAccountAction(
    client,
    context,
    'verify',
    nativeAccountProof,
    'en',
    () => undefined,
  );
  await Promise.resolve();
  boundary.select(tenantB);
  pending.resolve(nativeBootstrapResponse());
  await expect(operation).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('keeps a failed fresh-bootstrap request visible without sending a write', async () => {
  const { client, context, fetcher } = await sessionSetup(false);
  fetcher.mockRejectedValue(new Error('offline'));
  await expect(requireNativeAccountActions(client, context)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
