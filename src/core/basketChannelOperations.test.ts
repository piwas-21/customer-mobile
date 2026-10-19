import { channelInput } from '../test/basketChannels';
import { basketControllerFixture } from '../test/basketController';
import { existingBasketSession } from '../test/basketMutations';
import { currentBasketOwner } from '../test/basketOperations';
import { basketResponse } from '../test/basketApi';
import { response } from '../test/transport';
import { basketOperationRecordSchema } from './basketOperationRecord';
import { ApiFailure } from './transport';
it('journals a first channel before session installation and recovers only its original operation', async () => {
  const f = await basketControllerFixture();
  f.fetcher.mockImplementation(async (url) =>
    response(
      { success: true, data: url.includes('bootstrap') ? f.bootstrap : {} },
      url.includes('bootstrap') ? 200 : 503,
    ),
  );
  await expect(f.subject.changeChannel(channelInput(true), 'en')).rejects.toMatchObject({
    status: 503,
  });
  const saved = await f.repository.baskets.load(f.context, f.principal, currentBasketOwner);
  expect(saved).toMatchObject({ schemaVersion: 3, phase: 'ready', request: channelInput(true) });
  const original = f.fetcher.mock.calls.find(([, request]) => request.method === 'POST')!;
  expect(original[0]).toContain('/api/customer-mobile/basket/channel');
  f.fetcher.mockClear().mockResolvedValue(response({ success: true, data: basketResponse() }));
  const restarted = f.controller();
  await expect(restarted.recover('en')).resolves.toMatchObject({ id: basketResponse().id });
  expect(f.fetcher.mock.calls).toHaveLength(1);
  expect(f.fetcher.mock.calls[0]?.[1].body).toBe(original[1].body);
  expect(await restarted.pending()).toBeNull();
});
it('does not install a new session for a reviewed existing basket', async () => {
  const f = await basketControllerFixture();
  await expect(f.subject.changeChannel(channelInput(), 'en')).rejects.toThrow(
    'reviewed basket session',
  );
  expect(f.fetcher.mock.calls.some(([, request]) => request.method === 'POST')).toBe(false);
  expect(f.store.values.size).toBe(0);
});
it('captures the exact confirmed removal IDs before any asynchronous credential work', async () => {
  const f = await basketControllerFixture();
  await existingBasketSession(f);
  const removals = [basketResponse().items[0]!.id];
  const input = { ...channelInput(), confirmedConflictItemIds: removals };
  const result = f.subject.changeChannel(input, 'en');
  removals.splice(0);
  await result;
  const post = f.fetcher.mock.calls.find(([, request]) => request.method === 'POST')!;
  expect(JSON.parse(String(post[1].body)).confirmedConflictItemIds).toEqual([
    basketResponse().items[0]!.id,
  ]);
});
it('restores cancellation-only recovery without executing the original channel again', async () => {
  const f = await basketControllerFixture();
  f.fetcher.mockImplementation(async (url) =>
    response(
      { success: true, data: url.includes('bootstrap') ? f.bootstrap : {} },
      url.includes('bootstrap') ? 200 : 503,
    ),
  );
  await expect(f.subject.changeChannel(channelInput(true), 'en')).rejects.toMatchObject({
    status: 503,
  });
  await expect(f.subject.cancel('en')).rejects.toMatchObject({ status: 503 });
  const saved = await f.subject.pending();
  expect(saved?.cancellationRequested).toBe(true);
  f.fetcher
    .mockClear()
    .mockResolvedValue(
      response({ success: true, data: { operationId: saved!.operationId, outcome: 'Cancelled' } }),
    );
  const restarted = f.controller();
  await expect(restarted.recover('en')).rejects.toMatchObject({ status: 409 });
  expect(f.fetcher).not.toHaveBeenCalled();
  await expect(restarted.cancel('en')).resolves.toMatchObject({
    outcome: 'Cancelled',
    basket: null,
  });
  expect(f.fetcher.mock.calls[0]?.[0]).toContain('/api/customer-mobile/basket/channel/cancel');
  expect(await restarted.pending()).toBeNull();
});
it('refuses a substituted basket before acknowledging an existing-basket channel change', async () => {
  const f = await basketControllerFixture();
  await existingBasketSession(f);
  f.fetcher.mockImplementation(async (url) =>
    response({
      success: true,
      data: url.includes('bootstrap')
        ? f.bootstrap
        : { ...basketResponse(), id: f.context.tenant.id },
    }),
  );
  await expect(f.subject.changeChannel(channelInput(), 'en')).rejects.toEqual(
    expect.any(ApiFailure),
  );
  expect(await f.subject.pending()).toMatchObject({ schemaVersion: 3, request: channelInput() });
});
it('never restores installing records for an existing revision or an uninstalled cancellation', async () => {
  const f = await basketControllerFixture();
  await existingBasketSession(f);
  const record = await f.repository.baskets.prepareRequest(
    f.context,
    f.principal,
    { schemaVersion: 3, request: { ...channelInput(), confirmedConflictItemIds: [] } },
    f.createId,
    currentBasketOwner,
  );
  expect(() => basketOperationRecordSchema.parse({ ...record, phase: 'installing' })).toThrow();
  expect(() =>
    basketOperationRecordSchema.parse({
      ...record,
      request: channelInput(true),
      phase: 'installing',
      cancellationRequested: true,
    }),
  ).toThrow();
  expect(
    basketOperationRecordSchema.parse({
      ...record,
      request: channelInput(true),
      phase: 'installing',
    }).phase,
  ).toBe('installing');
});
