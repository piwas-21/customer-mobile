import { z } from 'zod';
import { tableRoundFixture, roundGuard, roundOutcome } from '../test/tableRoundRepository';
import { tableRoundPath } from './tableRoundRequest';
import { response } from '../test/transport';
import { tenantA, tenantB } from '../test/fixtures';
import type { RequestOptions } from './httpTypes';

it.each(['route', 'method', 'mode', 'body', 'scope', 'owner', 'missing-guard', 'extra-field'])(
  'binds preparation before any secure read or request: %s',
  async (field) => {
    const f = await tableRoundFixture();
    let path = tableRoundPath + '/prepare';
    const options: RequestOptions = {
      method: 'POST',
      credentials: 'table-round-prepare',
      principal: f.principal,
      expectedRoundPreparation: f.review.preparation,
      body: f.review.preparation.intent,
      assertCurrent: roundGuard,
    };
    if (field === 'route') path += '?redirect=other';
    if (field === 'method') options.method = 'GET';
    if (field === 'mode') options.credentials = 'basket';
    if (field === 'body')
      options.body = { ...f.review.preparation.intent, expectedAccountRevision: 8 };
    if (field === 'scope')
      options.expectedRoundPreparation = { ...f.review.preparation, environment: 'production' };
    if (field === 'owner') options.principal = { kind: 'guest', id: 'someone-else' };
    if (field === 'missing-guard') delete options.assertCurrent;
    if (field === 'extra-field')
      options.body = { ...f.review.preparation.intent, participantToken: 'untrusted' };
    const read = jest.spyOn(f.repository.vault, 'capability');
    await expect(f.client.request(f.context, path, z.unknown(), options)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
it.each([
  'operation',
  'payload',
  'basket',
  'revision',
  'participant',
  'preparation-session',
  'stop-without-ack',
  'resolved',
  'stored-record',
])('cannot dispatch a substituted or withdrawn original: %s', async (field) => {
  const f = await tableRoundFixture();
  const record = await f.install();
  let path = tableRoundPath + '/submit';
  const options: RequestOptions = {
    method: 'POST',
    credentials: 'table-round-operation',
    principal: f.principal,
    expectedRoundRecord: record,
    expectedRoundPreparation: f.review.preparation,
    body: {
      ...record.intent,
      payloadHash: record.proof.payloadHash,
      ownerProof: record.proof.ownerProof,
    },
    assertCurrent: roundGuard,
  };
  if (field === 'operation')
    options.body = {
      ...record.intent,
      operationId: tenantA,
      payloadHash: record.proof.payloadHash,
      ownerProof: record.proof.ownerProof,
    };
  if (field === 'payload')
    options.body = {
      ...record.intent,
      payloadHash: 'f'.repeat(64),
      ownerProof: record.proof.ownerProof,
    };
  if (field === 'basket')
    options.body = {
      ...record.intent,
      expectedBasketId: record.intent.serviceSessionId,
      payloadHash: record.proof.payloadHash,
      ownerProof: record.proof.ownerProof,
    };
  if (field === 'revision')
    options.body = {
      ...record.intent,
      expectedAccountRevision: 8,
      payloadHash: record.proof.payloadHash,
      ownerProof: record.proof.ownerProof,
    };
  if (field === 'participant')
    await f.repository.vault.saveCapability(
      f.context,
      'table-participant',
      f.principal,
      JSON.stringify({
        ...f.request.visit,
        identity: { ...f.request.visit.identity, participantToken: 'B'.repeat(43) },
      }),
    );
  if (field === 'preparation-session')
    options.expectedRoundPreparation = { ...f.review.preparation, sessionId: tenantB };
  if (field === 'stop-without-ack') {
    path = tableRoundPath + '/cancel-attempt';
    options.body = record.proof;
    delete options.expectedRoundPreparation;
  }
  if (field === 'resolved')
    options.expectedRoundRecord = { ...record, resolution: roundOutcome(record) };
  if (field === 'stored-record')
    await f.repository.tableRounds.requestCancellation(
      f.context,
      f.principal,
      record.proof.operationId,
      roundGuard,
    );
  f.fetcher.mockResolvedValue(response({ success: true, data: roundOutcome(record, true) }));
  await expect(f.client.request(f.context, path, z.unknown(), options)).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
});
