import { z } from 'zod';
import { tableContributionFixture } from '../test/tablePaymentRepository';
import { roundGuard } from '../test/tableRoundRepository';
import { contributionResolution } from '../test/tablePayment';
import { tableContributionPath, tableContributionCheckoutPath } from './tableContributionRequest';
import type { RequestOptions } from './httpTypes';
import { secretKey } from './credentials';
import { tenantA, tenantB } from '../test/fixtures';
it.each(['path', 'method', 'mode', 'body', 'scope', 'owner', 'guard', 'extra'])(
  'rejects substituted preparation before secure reads: %s',
  async (changed) => {
    const f = await tableContributionFixture();
    let path = tableContributionPath + '/prepare';
    const options: RequestOptions = {
      method: 'POST',
      credentials: 'table-payment-prepare',
      principal: f.principal,
      expectedContributionPreparation: f.preparation,
      body: f.preparation.intent,
      assertCurrent: roundGuard,
    };
    if (changed === 'path') path += '?redirect=elsewhere';
    if (changed === 'method') options.method = 'GET';
    if (changed === 'mode') options.credentials = 'basket';
    if (changed === 'body') options.body = { ...f.preparation.intent, expectedAccountRevision: 8 };
    if (changed === 'scope')
      options.expectedContributionPreparation = { ...f.preparation, environment: 'production' };
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
  'participant',
  'resolved',
  'stored-record',
  'stop-without-ack',
  'checkout-mode',
])('cannot dispatch a substituted original: %s', async (changed) => {
  const f = await tableContributionFixture();
  const record = await f.install();
  let path = tableContributionPath + '/submit';
  const options: RequestOptions = {
    method: 'POST',
    credentials: 'table-payment-operation',
    principal: f.principal,
    expectedContributionRecord: record,
    expectedContributionPreparation: f.preparation,
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
    options.expectedContributionPreparation = { ...f.preparation, sessionId: tenantB };
  if (changed === 'participant')
    await f.store.set(
      secretKey(f.context, 'table-participant', f.principal),
      JSON.stringify({
        ...f.preparation.visit,
        identity: { ...f.preparation.visit.identity, participantToken: 'B'.repeat(43) },
      }),
    );
  if (changed === 'resolved')
    options.expectedContributionRecord = { ...record, resolution: contributionResolution() };
  if (changed === 'stored-record')
    await f.repository.tablePayments.requestCancellation(
      f.context,
      f.principal,
      record.proof.operationId,
      roundGuard,
    );
  if (changed === 'stop-without-ack') {
    path = tableContributionPath + '/stop';
    delete options.expectedContributionPreparation;
    options.body = record.proof;
  }
  if (changed === 'checkout-mode') options.credentials = 'table-checkout-operation';
  await expect(f.client.request(f.context, path, z.unknown(), options)).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
});
it.each([
  'prepare',
  'submit',
  'recover',
  'stop',
  'checkout/start',
  'checkout/recover',
  'checkout/stop',
])('refuses an unauthenticated internal fallback for %s', async (phase) => {
  const f = await tableContributionFixture();
  const record = await f.install();
  await expect(
    f.client.request(f.context, tableContributionPath + '/' + phase, z.unknown(), {
      method: 'POST',
      body: record.proof,
    }),
  ).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
});
it('refuses checkout before an accepted reservation and refuses an unacknowledged checkout stop', async () => {
  const f = await tableContributionFixture();
  const record = await f.install();
  const options: RequestOptions = {
    method: 'POST',
    credentials: 'table-checkout-operation',
    principal: f.principal,
    expectedContributionRecord: record,
    expectedContributionPreparation: f.preparation,
    body: record.proof,
    assertCurrent: roundGuard,
  };
  await expect(
    f.client.request(f.context, tableContributionCheckoutPath + '/start', z.unknown(), options),
  ).rejects.toThrow();
  options.expectedContributionRecord = await f.repository.tablePayments.finishResolution(
    f.context,
    record,
    contributionResolution(),
    roundGuard,
  );
  delete options.expectedContributionPreparation;
  await expect(
    f.client.request(f.context, tableContributionCheckoutPath + '/stop', z.unknown(), options),
  ).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
});
