import { fixtureDirectory, memorySecrets, tenantA, tenantB } from '../test/fixtures';
import { preparedRound, roundIntent } from '../test/tableRound';
import { TenantBoundary } from './tenantContext';
import { CredentialVault, secretKey } from './credentials';
import {
  scopedTableRound,
  tableRoundRecordSchema,
  type TableRoundRecord,
} from './tableRoundRecord';
import { TableRoundStorage } from './tableRoundStorage';

function fixture() {
  const context = new TenantBoundary(fixtureDirectory()).select(tenantA);
  const store = memorySecrets();
  const principal = { kind: 'guest', id: 'basket' } as const;
  const record: TableRoundRecord = {
    schemaVersion: 1,
    environment: 'staging',
    tenantId: tenantA,
    principal,
    sessionId: tenantB,
    intent: roundIntent(),
    proof: preparedRound().proof,
    cancellationRequested: false,
    resolution: null,
  };
  return { context, store, principal, record, storage: new TableRoundStorage(store) };
}
const current = () => {};
function applied(record: TableRoundRecord): TableRoundRecord {
  return {
    ...record,
    resolution: {
      schemaVersion: 1,
      operationId: record.proof.operationId,
      serviceSessionId: record.intent.serviceSessionId,
      outcome: 'Applied',
      orderId: tenantB,
    },
  };
}
it('acknowledges one private original record and retains it across ordinary credential cleanup', async () => {
  const f = fixture();
  await expect(f.storage.save(f.context, f.record, current)).resolves.toEqual(f.record);
  expect([...f.store.values.keys()]).toEqual([
    secretKey(f.context, 'table-round-operation', f.principal),
  ]);
  await new CredentialVault(f.store).clear(f.context, f.principal);
  await expect(f.storage.read(f.context, f.principal, current)).resolves.toEqual(f.record);
  expect(JSON.stringify(f.record)).not.toMatch(/participantToken|customerEmail|quote|accessToken/);
});
it('refuses a silently dropped private save', async () => {
  const f = fixture();
  jest.spyOn(f.store, 'set').mockResolvedValue(undefined);
  await expect(f.storage.save(f.context, f.record, current)).rejects.toThrow('save incomplete');
});
it('retains an acknowledged pending record when its owner withdraws during the save', async () => {
  const f = fixture();
  let active = true;
  const original = f.store.set;
  jest.spyOn(f.store, 'set').mockImplementation(async (key, value) => {
    await original(key, value);
    active = false;
  });
  await expect(
    f.storage.save(f.context, f.record, () => {
      if (!active) throw new Error('Owner withdrew');
    }),
  ).rejects.toThrow('Owner withdrew');
  await expect(f.storage.read(f.context, f.principal, current)).resolves.toEqual(f.record);
});
it('never forgets a pending original attempt', async () => {
  const f = fixture();
  await f.storage.save(f.context, f.record, current);
  const remove = jest.spyOn(f.store, 'remove');
  await expect(f.storage.forgetResolved(f.context, f.record, current)).rejects.toThrow();
  expect(remove).not.toHaveBeenCalled();
});
it('acknowledges terminal deletion and refuses a silently retained record', async () => {
  const f = fixture();
  const resolved = applied(f.record);
  await f.storage.save(f.context, resolved, current);
  const remove = jest.spyOn(f.store, 'remove').mockResolvedValue(undefined);
  await expect(f.storage.forgetResolved(f.context, resolved, current)).rejects.toThrow(
    'removal incomplete',
  );
  await expect(f.storage.read(f.context, f.principal, current)).resolves.toEqual(resolved);
  remove.mockRestore();
  await f.storage.forgetResolved(f.context, resolved, current);
  await expect(f.storage.read(f.context, f.principal, current)).resolves.toBeNull();
});
it('a stale terminal confirmation cannot delete another original operation', async () => {
  const f = fixture();
  const old = applied(f.record);
  const replacement = applied({
    ...f.record,
    intent: { ...f.record.intent, operationId: tenantA },
    proof: { ...f.record.proof, operationId: tenantA },
  });
  await f.storage.save(f.context, replacement, current);
  await expect(f.storage.forgetResolved(f.context, old, current)).rejects.toThrow();
  await expect(f.storage.read(f.context, f.principal, current)).resolves.toEqual(replacement);
});
it.each(['tenant', 'environment', 'owner', 'kind'])(
  'refuses original scope substitution: %s',
  (field) => {
    const f = fixture();
    let record = f.record;
    if (field === 'tenant')
      record = {
        ...record,
        tenantId: tenantB,
        intent: { ...record.intent, tenantId: tenantB },
        proof: { ...record.proof, tenantId: tenantB },
      };
    if (field === 'environment') record = { ...record, environment: 'production' };
    if (field === 'owner') record = { ...record, principal: { kind: 'guest', id: 'someone-else' } };
    if (field === 'kind')
      record = { ...record, principal: { kind: 'customer', id: f.principal.id } };
    expect(() => scopedTableRound(f.context, f.principal, record)).toThrow();
  },
);
it.each(['participantToken', 'customerEmail', 'accessToken', 'quote'])(
  'refuses private unrelated fields in original custody: %s',
  (field) => {
    const f = fixture();
    expect(tableRoundRecordSchema.safeParse({ ...f.record, [field]: 'untrusted' }).success).toBe(
      false,
    );
  },
);
it.each(['Unseen', 'operation', 'visit', 'tenant'])(
  'cannot store a misleading canonical decision: %s',
  (field) => {
    const f = fixture();
    const record = applied(f.record);
    if (field === 'Unseen')
      record.resolution = { ...record.resolution!, outcome: 'Unseen', orderId: null };
    if (field === 'operation') record.proof.operationId = tenantA;
    if (field === 'visit') record.resolution!.serviceSessionId = tenantB;
    if (field === 'tenant') record.intent.tenantId = tenantB;
    expect(tableRoundRecordSchema.safeParse(record).success).toBe(false);
  },
);
