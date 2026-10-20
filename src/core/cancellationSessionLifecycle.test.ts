import { secretKey } from './credentials';
import { SessionRepository } from './sessionRepository';
import { cancellationStorageFixture } from '../test/cancellationStorage';

async function setup() {
  const fixture = cancellationStorageFixture(true);
  const { repository, context, principal, store } = fixture;
  const session = { userId: principal.id, accessToken: 'access', refreshToken: 'refresh' };
  await repository.activate(context, session, () => true);
  const record = await fixture.prepare();
  const key = secretKey(context, 'order-cancellation', principal);
  const sessionKey = secretKey(context, 'session', principal);
  return { ...fixture, session, key, sessionKey, record, store };
}

it.each([false, true])(
  'retains a pending action and owner reminder on logout (automatic=%s)',
  async (automatic) => {
    const { repository, context, principal, session, key, sessionKey, store } = await setup();
    const saved = store.values.get(key);
    store.values.set(secretKey(context, 'order-decisions', principal), 'private-history');
    expect(await repository.clear(context, session, automatic)).toBe(true);
    expect(store.values.get(key)).toBe(saved);
    expect(store.values.has(sessionKey)).toBe(false);
    expect(store.values.has(secretKey(context, 'order-decisions', principal))).toBe(false);
    const restarted = new SessionRepository(store);
    expect(await restarted.load(context)).toBeNull();
    expect(await restarted.loadPaymentAttention(context)).toBe(principal.id);
    expect(await restarted.cancellations.load(context, principal, () => {})).toMatchObject({
      resolution: null,
    });
  },
);

it('purges captured credentials after restaurant withdrawal while retaining pending recovery', async () => {
  const { repository, context, boundary, session, key, sessionKey, principal, store } =
    await setup();
  const saved = store.values.get(key);
  boundary.clear();
  expect(context.signal.aborted).toBe(true);
  expect(await repository.clear(context, session)).toBe(true);
  expect(store.values.has(sessionKey)).toBe(false);
  expect(store.values.get(key)).toBe(saved);
  expect(await repository.loadPaymentAttention(context)).toBe(principal.id);
});

it('removes a resolved action on logout without retaining an attention marker', async () => {
  const { repository, context, session, record, key, store } = await setup();
  await repository.cancellations.finish(
    context,
    record,
    {
      schemaVersion: 1,
      operationId: record.intent.operationId,
      orderId: record.intent.orderId,
      outcome: 'Cancelled',
      observedVersion: 8,
      reason: null,
    },
    () => {},
  );
  expect(await repository.clear(context, session)).toBe(true);
  expect(store.values.has(key)).toBe(false);
  expect(await repository.loadPaymentAttention(context)).toBeNull();
  expect(store.values.size).toBe(0);
});

it('withdraws credentials even when resolved-proof removal fails and completes cleanup after restart', async () => {
  const { repository, context, session, record, key, sessionKey, store } = await setup();
  await repository.cancellations.finish(
    context,
    record,
    {
      schemaVersion: 1,
      operationId: record.intent.operationId,
      orderId: record.intent.orderId,
      outcome: 'Cancelled',
      observedVersion: 8,
      reason: null,
    },
    () => {},
  );
  const remove = store.remove;
  let locked = true;
  jest
    .spyOn(store, 'remove')
    .mockImplementation((candidate) =>
      locked && candidate === key ? Promise.reject(new Error('Locked')) : remove(candidate),
    );
  await expect(repository.clear(context, session)).rejects.toThrow('Locked');
  expect(store.values.has(sessionKey)).toBe(false);
  const restarted = new SessionRepository(store);
  await expect(restarted.load(context)).rejects.toThrow('Locked');
  locked = false;
  expect(await restarted.load(context)).toBeNull();
  expect(store.values.size).toBe(0);
});

it('allows account-disabled recovery only while the cancellation remains pending', async () => {
  const { repository, context, session, record } = await setup();
  expect(await repository.loadForOrderRecovery(context)).toEqual(session);
  await repository.cancellations.finish(
    context,
    record,
    {
      schemaVersion: 1,
      operationId: record.intent.operationId,
      orderId: record.intent.orderId,
      outcome: 'Cancelled',
      observedVersion: 8,
      reason: null,
    },
    () => {},
  );
  expect(await repository.loadForOrderRecovery(context)).toBeNull();
});
