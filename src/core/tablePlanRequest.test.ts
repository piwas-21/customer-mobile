import { z } from 'zod';
import { tablePlanFixture } from '../test/tablePlanRepository';
import { roundGuard } from '../test/tableRoundRepository';
import { planResolution } from '../test/tablePlan';
import { tablePlanPath } from './tablePlanRequest';
import type { RequestOptions } from './httpTypes';
import { secretKey } from './credentials';
import { tenantA, tenantB } from '../test/fixtures';
it.each(['path', 'method', 'mode', 'body', 'scope', 'owner', 'guard', 'extra'])(
  'rejects substituted preparation before secure reads: %s',
  async (changed) => {
    const f = await tablePlanFixture();
    let path = tablePlanPath + '/prepare';
    const options: RequestOptions = {
      method: 'POST',
      credentials: 'table-plan-prepare',
      principal: f.principal,
      expectedPlanPreparation: f.preparation,
      body: f.preparation.intent,
      assertCurrent: roundGuard,
    };
    if (changed === 'path') path += '?redirect=elsewhere';
    if (changed === 'method') options.method = 'GET';
    if (changed === 'mode') options.credentials = 'basket';
    if (changed === 'body') options.body = { ...f.preparation.intent, expectedAccountRevision: 8 };
    if (changed === 'scope')
      options.expectedPlanPreparation = { ...f.preparation, environment: 'production' };
    if (changed === 'owner') options.principal = { kind: 'guest', id: 'another-owner' };
    if (changed === 'guard') delete options.assertCurrent;
    if (changed === 'extra')
      options.body = { ...f.preparation.intent, participantToken: 'untrusted' };
    const read = jest.spyOn(f.repository.vault, 'capability');
    await expect(f.client.request(f.context, path, z.unknown(), options)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
it.each([
  'operation',
  'proof',
  'intent',
  'preparation-session',
  'stored-session',
  'participant',
  'resolved',
  'stored-record',
  'stop-without-ack',
  'checkout-mode',
])('cannot dispatch a substituted original: %s', async (changed) => {
  const f = await tablePlanFixture();
  const record = await f.install();
  let path = tablePlanPath + '/submit';
  const options: RequestOptions = {
    method: 'POST',
    credentials: 'table-plan-operation',
    principal: f.principal,
    expectedPlanRecord: record,
    expectedPlanPreparation: f.preparation,
    body: { intent: record.intent, proof: record.proof },
    assertCurrent: roundGuard,
  };
  if (changed === 'operation')
    options.body = { intent: record.intent, proof: { ...record.proof, operationId: tenantA } };
  if (changed === 'proof')
    options.body = {
      intent: record.intent,
      proof: { ...record.proof, payloadHash: 'f'.repeat(64) },
    };
  if (changed === 'intent')
    options.body = {
      intent: { ...record.intent, expectedAccountRevision: 8 },
      proof: record.proof,
    };
  if (changed === 'preparation-session')
    options.expectedPlanPreparation = { ...f.preparation, sessionId: tenantB };
  if (changed === 'stored-session')
    await f.store.set(secretKey(f.context, 'guest-session', f.principal), tenantB);
  if (changed === 'participant')
    await f.store.set(
      secretKey(f.context, 'table-participant', f.principal),
      JSON.stringify({
        ...f.preparation.visit,
        identity: { ...f.preparation.visit.identity, participantToken: 'B'.repeat(43) },
      }),
    );
  if (changed === 'resolved')
    options.expectedPlanRecord = { ...record, resolution: planResolution() };
  if (changed === 'stored-record')
    await f.repository.tablePlans.requestCancellation(
      f.context,
      f.principal,
      record.proof.operationId,
      roundGuard,
    );
  if (changed === 'stop-without-ack') {
    path = tablePlanPath + '/stop';
    delete options.expectedPlanPreparation;
    options.body = record.proof;
  }
  if (changed === 'checkout-mode') options.credentials = 'table-round-operation';
  await expect(f.client.request(f.context, path, z.unknown(), options)).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
});
it.each(['prepare', 'submit', 'recover', 'stop'])(
  'refuses generic credential fallback on plan route %s',
  async (phase) => {
    const f = await tablePlanFixture();
    await expect(
      f.client.request(f.context, tablePlanPath + '/' + phase, z.unknown(), {
        method: 'POST',
        body: f.prepared.proof,
      }),
    ).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
