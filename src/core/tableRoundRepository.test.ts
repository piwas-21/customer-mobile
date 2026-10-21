import { tableRoundFixture, roundGuard } from '../test/tableRoundRepository';
import { tenantA, tenantB } from '../test/fixtures';
import { SessionRepository } from './sessionRepository';
import { secretKey } from './credentials';

it.each([false, true])(
  'acknowledges one original round and restores its exact private scope after restart: customer=%s',
  async (customer) => {
    const f = await tableRoundFixture(customer);
    const record = await f.install();
    const restored = new SessionRepository(f.store);
    expect(await restored.tableRounds.load(f.context, f.principal, roundGuard)).toEqual(record);
    expect(record.sessionId).toBe(f.request.sessionId);
    expect(record.intent).toEqual(f.review.preparation.intent);
    expect(record.proof).toEqual(f.prepared.proof);
    expect(JSON.stringify(record)).not.toMatch(/participantToken|customerEmail|accessToken|quote/);
    await expect(f.install()).rejects.toThrow();
  },
);
it('serializes two competing claims across repositories sharing the installation queue', async () => {
  const f = await tableRoundFixture();
  const results = await Promise.allSettled([f.install(), f.install()]);
  expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
});
it.each(['basket-operation', 'order-operation-proof'] as const)(
  'refuses a partially saved competing %s',
  async (kind) => {
    const f = await tableRoundFixture();
    await f.store.set(secretKey(f.context, kind, f.principal), 'incomplete');
    await expect(f.install()).rejects.toThrow();
    expect(await f.repository.tableRounds.load(f.context, f.principal, roundGuard)).toBeNull();
  },
);
it.each(['session', 'visit', 'token', 'expiry'])(
  'refuses installation when the captured private %s changes during review',
  async (field) => {
    const f = await tableRoundFixture();
    if (field === 'session')
      await f.repository.vault.saveCapability(f.context, 'guest-session', f.principal, tenantA);
    else {
      const visit = {
        ...f.review.preparation.visit,
        identity: { ...f.review.preparation.visit.identity },
      };
      if (field === 'visit') visit.identity.serviceSessionId = tenantB;
      if (field === 'token') visit.identity.participantToken = 'B'.repeat(43);
      if (field === 'expiry') visit.identity.expiresAt = '2020-01-01T00:00:00Z';
      await f.store.set(
        secretKey(f.context, 'table-participant', f.principal),
        JSON.stringify(visit),
      );
    }
    await expect(f.install()).rejects.toThrow();
  },
);
it('retains a saved original when its storage acknowledgement is lost and refuses a replacement', async () => {
  const f = await tableRoundFixture();
  const set = f.store.set;
  const key = secretKey(f.context, 'table-round-operation', f.principal);
  const write = jest.spyOn(f.store, 'set').mockImplementation(async (k, v) => {
    await set(k, v);
    if (k === key) throw new Error('Acknowledgement lost');
  });
  await expect(f.install()).rejects.toThrow('Acknowledgement lost');
  write.mockRestore();
  expect(
    (await new SessionRepository(f.store).tableRounds.load(f.context, f.principal, roundGuard))
      ?.proof,
  ).toEqual(f.prepared.proof);
  await expect(f.install()).rejects.toThrow();
});
