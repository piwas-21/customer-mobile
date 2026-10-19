import { basketControllerFixture } from '../test/basketController';
import { basketMutation, existingBasketSession } from '../test/basketMutations';
import { basketInput, basketOperationId, currentBasketOwner } from '../test/basketOperations';
import { basketResponse } from '../test/basketApi';
import { response } from '../test/transport';
import { deferred } from '../test/deferred';
import { tenantA } from '../test/fixtures';
function updatedBasket() {
  const value = basketResponse();
  return {
    ...value,
    items: value.items.map((item) => ({ ...item, quantity: 3, itemTotal: 21 })),
    subTotal: 21,
    totalItems: 3,
    total: 24.2,
  };
}
it('persists a typed edit before dispatch and coalesces identical taps without borrowing an add', async () => {
  const f = await basketControllerFixture();
  await existingBasketSession(f);
  const entered = deferred<void>();
  const finish = deferred<void>();
  const request = basketMutation();
  f.fetcher.mockImplementation(async (url, options) => {
    if (url.includes('/bootstrap?')) return response({ success: true, data: f.bootstrap });
    expect(
      await f.repository.baskets.load(f.context, f.principal, currentBasketOwner),
    ).toMatchObject({
      schemaVersion: 2,
      operationId: basketOperationId,
      request: basketMutation(),
    });
    expect(url).toContain(`/items/${request.basketItemId}/operations`);
    expect(JSON.parse(options.body ?? '{}')).toEqual({
      expectedBasketId: request.expectedBasketId,
      expectedPurchaseFingerprint: request.expectedPurchaseFingerprint,
      action: 'Update',
      quantity: 3,
      specialInstructions: 'Keep this note',
      operationId: basketOperationId,
    });
    entered.resolve();
    await finish.promise;
    return response({ success: true, data: updatedBasket() });
  });
  const first = f.subject.mutate(request, 'en');
  Object.assign(request, { quantity: 99 });
  const duplicate = f.subject.mutate(basketMutation(), 'en');
  await entered.promise;
  await expect(f.subject.add(basketInput, 'en')).rejects.toMatchObject({ status: 409 });
  await expect(f.subject.mutate(basketMutation('Remove'), 'en')).rejects.toMatchObject({
    status: 409,
  });
  finish.resolve();
  expect(await Promise.all([first, duplicate])).toEqual([updatedBasket(), updatedBasket()]);
  expect(f.fetcher.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
  expect(await f.subject.pending()).toBeNull();
});
it('restores an unknown edit for explicit recovery with exactly the same route, body and operation', async () => {
  const f = await basketControllerFixture();
  await existingBasketSession(f);
  f.fetcher
    .mockResolvedValueOnce(response({ success: true, data: f.bootstrap }))
    .mockRejectedValueOnce(new Error('Lost after commit'));
  await expect(f.subject.mutate(basketMutation(), 'en')).rejects.toMatchObject({
    reason: 'network',
  });
  const pending = await f.subject.pending();
  expect(pending).toMatchObject({ schemaVersion: 2, operationId: basketOperationId });
  const first = f.fetcher.mock.calls.find(([, options]) => options.method === 'POST')!;
  f.subject.dispose();
  const restarted = f.controller();
  f.fetcher.mockResolvedValue(response({ success: true, data: updatedBasket() }));
  await expect(restarted.add(basketInput, 'en')).rejects.toMatchObject({ status: 409 });
  expect(await restarted.recover('en')).toEqual(updatedBasket());
  const last = f.fetcher.mock.calls.at(-1)!;
  expect(last[0]).toBe(first[0]);
  expect(last[1].body).toBe(first[1].body);
  expect(await restarted.pending()).toBeNull();
});
it('accepts removal readback with the same real basket identity and no remaining lines', async () => {
  const f = await basketControllerFixture();
  await existingBasketSession(f);
  const empty = {
    ...basketResponse(),
    items: [],
    totalItems: 0,
    subTotal: 0,
    tax: 0,
    deliveryFee: 0,
    total: 0,
    purchaseFingerprint: 'b'.repeat(64),
  };
  f.fetcher
    .mockResolvedValueOnce(response({ success: true, data: f.bootstrap }))
    .mockResolvedValueOnce(response({ success: true, data: empty }));
  expect(await f.subject.mutate(basketMutation('Remove'), 'en')).toEqual(empty);
  expect(await f.subject.pending()).toBeNull();
  const body = JSON.parse(f.fetcher.mock.calls.at(-1)![1].body!);
  expect(body).toEqual({
    action: 'Remove',
    expectedBasketId: empty.id,
    expectedPurchaseFingerprint: basketMutation().expectedPurchaseFingerprint,
    operationId: basketOperationId,
  });
});
it('rejects another owned basket ID and keeps the journal instead of acknowledging a substituted result', async () => {
  const f = await basketControllerFixture();
  await existingBasketSession(f);
  f.fetcher
    .mockResolvedValueOnce(response({ success: true, data: f.bootstrap }))
    .mockResolvedValueOnce(response({ success: true, data: { ...updatedBasket(), id: tenantA } }));
  await expect(f.subject.mutate(basketMutation(), 'en')).rejects.toMatchObject({
    reason: 'contract',
  });
  expect(await f.subject.pending()).toMatchObject({
    schemaVersion: 2,
    operationId: basketOperationId,
  });
});
it('keeps stale refusal unresolved and withdraws new edits when ordering is unavailable', async () => {
  const f = await basketControllerFixture();
  await existingBasketSession(f);
  f.fetcher.mockResolvedValueOnce(
    response({ success: true, data: { ...f.bootstrap, capabilities: { ordering: 'disabled' } } }),
  );
  await expect(f.subject.mutate(basketMutation(), 'en')).rejects.toMatchObject({ status: 404 });
  expect(await f.subject.pending()).toBeNull();
  f.fetcher
    .mockResolvedValueOnce(response({ success: true, data: f.bootstrap }))
    .mockResolvedValueOnce(response({}, 409));
  await expect(f.subject.mutate(basketMutation(), 'en')).rejects.toMatchObject({ status: 409 });
  expect(await f.subject.pending()).toMatchObject({ schemaVersion: 2 });
  await expect(f.subject.add(basketInput, 'en')).rejects.toMatchObject({ status: 409 });
});
