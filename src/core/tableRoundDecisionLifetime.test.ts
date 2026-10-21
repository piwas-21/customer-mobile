import { tableRoundFixture, roundGuard, roundOutcome } from '../test/tableRoundRepository';
import { basketInput, basketOperationId } from '../test/basketOperations';
import { checkoutIntent } from '../test/customerOrder';
import { tenantA, tenantB } from '../test/fixtures';
import { tableIdentity } from '../test/tableAccount';
import { SessionRepository } from './sessionRepository';
import type { TableRoundResolution } from '../api/tableRoundContract';

it('durably seals the local dispatch path before stopping and preserves the original intent', async () => {
  const f = await tableRoundFixture();
  const record = await f.install();
  const stopped = await f.repository.tableRounds.requestCancellation(
    f.context,
    f.principal,
    record.proof.operationId,
    roundGuard,
  );
  expect(stopped).toEqual({ ...record, cancellationRequested: true });
  expect(
    await new SessionRepository(f.store).tableRounds.load(f.context, f.principal, roundGuard),
  ).toEqual(stopped);
});
it('an Unseen observation cannot release the original or withdraw the durable stop', async () => {
  const f = await tableRoundFixture();
  const record = await f.install();
  const stopping = await f.repository.tableRounds.requestCancellation(
    f.context,
    f.principal,
    record.proof.operationId,
    roundGuard,
  );
  const unseen: TableRoundResolution = {
    ...roundOutcome(record),
    outcome: 'Unseen',
    orderId: null,
  };
  expect(await f.repository.tableRounds.finish(f.context, record, unseen, roundGuard)).toEqual(
    stopping,
  );
  await expect(f.install()).rejects.toThrow();
  await expect(
    f.repository.tableRounds.acknowledge(f.context, record, roundGuard),
  ).rejects.toThrow();
});
it.each([false, true])(
  'only an exact canonical terminal decision releases purchase arbitration: applied=%s',
  async (applied) => {
    const f = await tableRoundFixture();
    const record = await f.install();
    expect(
      await f.repository.orders.hasUnresolvedPurchase(f.context, f.principal, roundGuard),
    ).toBe(true);
    await expect(
      f.repository.baskets.prepare(
        f.context,
        f.principal,
        basketInput,
        () => basketOperationId,
        roundGuard,
      ),
    ).rejects.toThrow();
    await expect(
      f.repository.orders.prepare(
        f.context,
        f.principal,
        { intent: checkoutIntent(), payloadHash: 'd'.repeat(64) },
        () => basketOperationId,
        roundGuard,
      ),
    ).rejects.toThrow();
    await f.repository.tableVisits.leave(
      f.context,
      f.principal,
      tableIdentity.serviceSessionId,
      roundGuard,
    );
    await expect(
      f.repository.tableVisits.install(f.context, f.principal, tableIdentity, roundGuard),
    ).rejects.toThrow();
    const resolved = await f.repository.tableRounds.finish(
      f.context,
      record,
      roundOutcome(record, applied),
      roundGuard,
    );
    expect(
      await f.repository.orders.hasUnresolvedPurchase(f.context, f.principal, roundGuard),
    ).toBe(false);
    expect(
      (await f.repository.tableVisits.install(f.context, f.principal, tableIdentity, roundGuard))
        .identity,
    ).toEqual(tableIdentity);
    await expect(f.install()).rejects.toThrow();
    await f.repository.tableRounds.acknowledge(f.context, resolved, roundGuard);
    expect(await f.repository.tableRounds.load(f.context, f.principal, roundGuard)).toBeNull();
  },
);
it.each(['operation', 'visit', 'original-input', 'canonical-regression', 'terminal-conflict'])(
  'refuses stale or misleading resolution: %s',
  async (field) => {
    const f = await tableRoundFixture();
    const record = await f.install();
    let resolution = roundOutcome(record, true);
    if (field === 'operation') resolution.operationId = tenantA;
    if (field === 'visit') resolution.serviceSessionId = tenantB;
    if (field === 'original-input') record.intent.expectedAccountRevision++;
    if (field === 'canonical-regression' || field === 'terminal-conflict') {
      await f.repository.tableRounds.finish(f.context, record, resolution, roundGuard);
      resolution =
        field === 'canonical-regression'
          ? { ...roundOutcome(record), outcome: 'Unseen', orderId: null }
          : roundOutcome(record);
    }
    await expect(
      Promise.resolve().then(() =>
        f.repository.tableRounds.finish(f.context, record, resolution, roundGuard),
      ),
    ).rejects.toThrow();
    expect(
      (await f.repository.tableRounds.load(f.context, f.principal, roundGuard))?.proof,
    ).toEqual(f.prepared.proof);
  },
);
it.each([false, true])(
  'original customer recovery survives account withdrawal and credential cleanup: automatic=%s',
  async (automatic) => {
    const f = await tableRoundFixture(true);
    const record = await f.install();
    await f.repository.tableVisits.leave(
      f.context,
      f.principal,
      tableIdentity.serviceSessionId,
      roundGuard,
    );
    expect(await f.repository.loadForOrderRecovery(f.context)).not.toBeNull();
    const session = await f.repository.load(f.context);
    await f.repository.clear(f.context, session!, automatic);
    expect(await f.repository.vault.session(f.context, f.principal.id)).toBeNull();
    expect(await f.repository.loadPaymentAttention(f.context)).toBe(f.principal.id);
    expect(
      await new SessionRepository(f.store).tableRounds.load(f.context, f.principal, roundGuard),
    ).toEqual(record);
  },
);
