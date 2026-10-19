import { BasketWorkspace } from './basketWorkspace';
import { basketControllerFixture } from '../test/basketController';
import { basketInput, basketSessionId } from '../test/basketOperations';
import { response } from '../test/transport';
import { basketResponse } from '../test/basketApi';
import { session } from '../test/sessions';
import { tenantB } from '../test/fixtures';
async function fixture(customer = false) {
  const f = await basketControllerFixture(customer);
  const make = () =>
    new BasketWorkspace(f.context, f.client, f.repository, f.sessions, f.principal, f.createId);
  return { ...f, make, workspace: make() };
}
it('loads a pristine basket without making an ID, writing secure storage, or sending HTTP', async () => {
  const f = await fixture();
  await expect(f.workspace.hasPending()).resolves.toBe(false);
  await expect(f.workspace.read('en')).resolves.toBeNull();
  expect(f.store.values.size).toBe(0);
  expect(f.fetcher).not.toHaveBeenCalled();
});
it('reads the exact owned session without acknowledging the pending add', async () => {
  const f = await fixture();
  const pending = await f.repository.baskets.prepare(
    f.context,
    f.principal,
    basketInput,
    f.createId,
    f.workspace.assertCurrent,
  );
  await expect(f.workspace.hasPending()).resolves.toBe(true);
  await expect(f.workspace.read('en')).resolves.toMatchObject({ totalItems: 2 });
  const [url, request] = f.fetcher.mock.calls[0]!;
  expect(new URL(url).pathname).toBe('/api/customer-mobile/basket');
  expect(request.headers?.['X-Session-Id']).toBe(basketSessionId);
  expect(request.headers).not.toHaveProperty('Authorization');
  expect(
    await f.repository.baskets.load(f.context, f.principal, f.workspace.assertCurrent),
  ).toEqual(pending);
});
it('recovers the original operation explicitly, then permits a separate logical add', async () => {
  const f = await fixture();
  await f.repository.baskets.prepare(
    f.context,
    f.principal,
    basketInput,
    f.createId,
    f.workspace.assertCurrent,
  );
  await expect(f.workspace.add(basketInput, 'en')).rejects.toMatchObject({ status: 409 });
  expect(f.fetcher).not.toHaveBeenCalled();
  await expect(f.workspace.recover('en')).resolves.toMatchObject({ totalItems: 2 });
  await expect(f.workspace.hasPending()).resolves.toBe(false);
  await f.workspace.add(basketInput, 'en');
  const writes = f.fetcher.mock.calls.filter(([, request]) => request.method === 'POST');
  expect(writes).toHaveLength(2);
  expect(JSON.parse(writes[0]![1].body!).operationId).not.toBe(
    JSON.parse(writes[1]![1].body!).operationId,
  );
});
it('retains a rejected or unknown operation until an explicit recovery succeeds', async () => {
  const f = await fixture();
  f.fetcher.mockImplementation(async (url) =>
    url.includes('bootstrap') ? response({ success: true, data: f.bootstrap }) : response({}, 503),
  );
  await expect(f.workspace.add(basketInput, 'en')).rejects.toMatchObject({ status: 503 });
  await expect(f.workspace.hasPending()).resolves.toBe(true);
  const before = f.fetcher.mock.calls.length;
  await expect(f.workspace.add(basketInput, 'en')).rejects.toMatchObject({ status: 409 });
  expect(f.fetcher.mock.calls.length).toBe(before);
});
it('refuses reads across a vault wait after logout before any HTTP dispatch', async () => {
  const f = await fixture(true);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  jest.spyOn(f.repository.vault, 'capability').mockImplementationOnce(async () => {
    await gate;
    return basketSessionId;
  });
  const read = f.workspace.read('en');
  await f.sessions.logout();
  release();
  await expect(read).rejects.toMatchObject({ status: 401 });
  expect(f.fetcher).not.toHaveBeenCalled();
});
it('withdraws a late response on disposal and does not erase a pending operation', async () => {
  const f = await fixture();
  await f.repository.baskets.prepare(
    f.context,
    f.principal,
    basketInput,
    f.createId,
    f.workspace.assertCurrent,
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.fetcher.mockImplementationOnce(async () => {
    await gate;
    return response({ success: true, data: basketResponse() });
  });
  const read = f.workspace.read('en');
  await new Promise((resolve) => setTimeout(resolve, 0));
  f.workspace.dispose();
  release();
  await expect(read).rejects.toMatchObject({ reason: 'refused' });
  const next = f.make();
  await expect(next.hasPending()).resolves.toBe(true);
});
it('announces failed same-user login ownership transitions so the old workspace cannot stay selected', async () => {
  const f = await fixture(true);
  const versions: string[] = [];
  f.sessions.subscribe(() => versions.push(f.sessions.ownerVersion));
  f.fetcher.mockResolvedValueOnce(response({}, 401));
  const before = f.sessions.ownerVersion;
  await expect(
    f.sessions.login({ email: 'user@example.test', password: 'incorrect' }, 'en'),
  ).rejects.toThrow();
  expect(f.sessions.userId).toBe(session.userId);
  expect(versions).toEqual([expect.stringContaining(':false'), expect.stringContaining(':true')]);
  expect(f.sessions.ownerVersion).not.toBe(before);
  await expect(f.workspace.read('en')).rejects.toMatchObject({ status: 401 });
  await expect(f.make().read('en')).resolves.toBeNull();
});

it('snapshots the caller principal before choosing any stored credentials', async () => {
  const f = await fixture(true);
  const caller = { kind: 'customer' as const, id: session.userId };
  const other = {
    ...session,
    userId: tenantB,
    accessToken: 'other-access',
    refreshToken: 'other-refresh',
  };
  await f.repository.vault.saveSession(f.context, other);
  await f.repository.vault.saveCapability(f.context, 'guest-session', caller, basketSessionId);
  await f.repository.vault.saveCapability(
    f.context,
    'guest-session',
    { kind: 'customer', id: tenantB },
    tenantB,
  );
  expect(await f.repository.vault.session(f.context, tenantB)).toEqual(other);
  const workspace = new BasketWorkspace(
    f.context,
    f.client,
    f.repository,
    f.sessions,
    caller,
    f.createId,
  );
  caller.id = tenantB;
  f.fetcher.mockImplementation(async (_url, request) =>
    response({
      success: true,
      data: basketResponse(
        request.headers?.Authorization === 'Bearer other-access' ? tenantB : session.userId,
      ),
    }),
  );
  await expect(workspace.read('en')).resolves.toMatchObject({ userId: session.userId });
  const headers = f.fetcher.mock.calls[0]![1].headers;
  expect(headers?.Authorization).toBe(`Bearer ${session.accessToken}`);
  expect(headers?.['X-Session-Id']).toBe(basketSessionId);
});
