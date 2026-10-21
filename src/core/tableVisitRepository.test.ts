import { SessionRepository } from './sessionRepository';
import { TenantBoundary } from './tenantContext';
import { fixtureDirectory, memorySecrets, tenantA, tenantB } from '../test/fixtures';
import { tableIdentity, tableVisitRecord } from '../test/tableAccount';
import { secretKey } from './credentials';
function fixture() {
  const store = memorySecrets();
  const boundary = new TenantBoundary(fixtureDirectory());
  const context = boundary.select(tenantA);
  const repository = new SessionRepository(store);
  return {
    store,
    boundary,
    context,
    repository,
    principal: tableVisitRecord().principal,
    guard: () => {},
  };
}
it('acknowledges the exact scoped private capability and restores it through the shared installation queue', async () => {
  const f = fixture();
  const record = await f.repository.tableVisits.install(
    f.context,
    f.principal,
    tableIdentity,
    f.guard,
  );
  expect(record).toEqual(tableVisitRecord());
  expect(await f.repository.tableVisits.read(f.context, f.principal, f.guard)).toEqual(record);
  expect(await f.repository.vault.capability(f.context, 'table-participant', f.principal)).toBe(
    JSON.stringify(record),
  );
  expect(
    await new SessionRepository(f.store).tableVisits.read(f.context, f.principal, f.guard),
  ).toEqual(record);
});
it('serializes competing admission installation and never replaces the first visit implicitly', async () => {
  const f = fixture();
  const results = await Promise.allSettled([
    f.repository.tableVisits.install(f.context, f.principal, tableIdentity, f.guard),
    f.repository.tableVisits.install(
      f.context,
      f.principal,
      { ...tableIdentity, serviceSessionId: tenantB },
      f.guard,
    ),
  ]);
  expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
  expect(
    (await f.repository.tableVisits.read(f.context, f.principal, f.guard))?.identity
      .serviceSessionId,
  ).toBe(tenantA);
});
it.each(['lost-ack', 'dropped-write', 'wrong-readback'] as const)(
  'fails closed after a secure %s while retaining any original stored capability',
  async (mode) => {
    const f = fixture();
    const key = secretKey(f.context, 'table-participant', f.principal);
    const set = f.store.set;
    const get = f.store.get;
    const write = jest.spyOn(f.store, 'set').mockImplementation(async (k, v) => {
      if (k !== key) return set(k, v);
      if (mode !== 'dropped-write') await set(k, v);
      if (mode === 'lost-ack') throw new Error('Lost acknowledgement');
    });
    const read = jest
      .spyOn(f.store, 'get')
      .mockImplementation((k) =>
        k === key && f.store.values.has(k) && mode === 'wrong-readback'
          ? Promise.resolve('wrong')
          : get(k),
      );
    await expect(
      f.repository.tableVisits.install(f.context, f.principal, tableIdentity, f.guard),
    ).rejects.toThrow();
    write.mockRestore();
    read.mockRestore();
    expect(await f.repository.tableVisits.read(f.context, f.principal, f.guard)).toEqual(
      mode === 'dropped-write' ? null : tableVisitRecord(),
    );
  },
);
it('refuses foreign or corrupt stored authority and never treats it as no visit', async () => {
  const f = fixture();
  const key = secretKey(f.context, 'table-participant', f.principal);
  for (const raw of [
    'broken',
    JSON.stringify({ ...tableVisitRecord(), tenantId: tenantB }),
    JSON.stringify({ ...tableVisitRecord(), environment: 'production' }),
    JSON.stringify({ ...tableVisitRecord(), principal: { kind: 'guest', id: 'other' } }),
  ]) {
    f.store.values.set(key, raw);
    await expect(f.repository.tableVisits.read(f.context, f.principal, f.guard)).rejects.toThrow();
    await expect(
      f.repository.tableVisits.install(f.context, f.principal, tableIdentity, f.guard),
    ).rejects.toThrow();
    expect(f.store.values.get(key)).toBe(raw);
  }
});
it('requires the exact current visit to leave and acknowledges deletion before removing access', async () => {
  const f = fixture();
  await f.repository.tableVisits.install(f.context, f.principal, tableIdentity, f.guard);
  await expect(
    f.repository.tableVisits.leave(f.context, f.principal, tenantB, f.guard),
  ).rejects.toThrow();
  const remove = jest.spyOn(f.store, 'remove').mockResolvedValue(undefined);
  await expect(
    f.repository.tableVisits.leave(f.context, f.principal, tenantA, f.guard),
  ).rejects.toThrow();
  remove.mockRestore();
  expect(await f.repository.tableVisits.read(f.context, f.principal, f.guard)).toEqual(
    tableVisitRecord(),
  );
  await f.repository.tableVisits.leave(f.context, f.principal, tenantA, f.guard);
  expect(await f.repository.tableVisits.read(f.context, f.principal, f.guard)).toBeNull();
});
it('rejects expired new authority, retains an expired existing record for explicit local leaving, and clears private access on logout cleanup', async () => {
  const f = fixture();
  await expect(
    f.repository.tableVisits.install(
      f.context,
      f.principal,
      { ...tableIdentity, expiresAt: '2000-01-01T00:00:00Z' },
      f.guard,
    ),
  ).rejects.toThrow();
  const key = secretKey(f.context, 'table-participant', f.principal);
  f.store.values.set(
    key,
    JSON.stringify({
      ...tableVisitRecord(),
      identity: { ...tableIdentity, expiresAt: '2000-01-01T00:00:00Z' },
    }),
  );
  expect(await f.repository.tableVisits.read(f.context, f.principal, f.guard)).not.toBeNull();
  const remove = jest.spyOn(f.store, 'remove').mockResolvedValue(undefined);
  await expect(f.repository.vault.clear(f.context, f.principal)).rejects.toThrow();
  remove.mockRestore();
  await f.repository.vault.clear(f.context, f.principal);
  expect(await f.repository.tableVisits.read(f.context, f.principal, f.guard)).toBeNull();
});
