import { CustomerOrderController } from './customerOrderController';
import { checkoutQuote, checkoutQuoteFixture } from '../test/checkoutQuote';
import { checkoutIntent, appliedOrder } from '../test/customerOrder';
import { basketOperationId, currentBasketOwner } from '../test/basketOperations';
import { response } from '../test/transport';
import { secretKey } from './credentials';
import { deferred } from '../test/deferred';
async function fixture(customer = false) {
  const f = await checkoutQuoteFixture(customer);
  const subject = new CustomerOrderController(
    f.context,
    f.client,
    f.repository,
    f.sessions,
    f.principal,
    () => basketOperationId,
  );
  const input = { ...f.request, intent: checkoutIntent() };
  f.fetcher.mockImplementation(async (url) =>
    response({
      success: true,
      data: url.endsWith('/prepare')
        ? { schemaVersion: 1, payloadHash: 'c'.repeat(64), quote: checkoutQuote() }
        : appliedOrder(),
    }),
  );
  return { ...f, subject, input };
}
it('prepares, durably saves and submits one order, then records its receipt before clearing the journal', async () => {
  const f = await fixture();
  const fetch = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation(async (url, options) => {
    if (url.endsWith('/submit')) {
      const saved = await f.repository.orders.load(f.context, f.principal, currentBasketOwner);
      expect(saved?.intent).toEqual(checkoutIntent());
      expect(saved?.proof.operationId).toBe(basketOperationId);
    }
    return fetch(url, options);
  });
  await expect(f.subject.submit(f.input)).resolves.toEqual(appliedOrder());
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  expect(await f.subject.pending()).toBeNull();
  expect(
    await f.repository.orders.decisions(f.context, f.principal, currentBasketOwner),
  ).toHaveLength(1);
});
it('coalesces identical active taps and refuses a competing order intent', async () => {
  const f = await fixture();
  const gate = deferred<Response>();
  f.fetcher.mockReturnValueOnce(gate.promise);
  const first = f.subject.submit(f.input);
  const duplicate = f.subject.submit(f.input);
  expect(duplicate).toBe(first);
  expect(() =>
    f.subject.submit({ ...f.input, intent: { ...f.input.intent, notes: 'Different intent' } }),
  ).toThrow();
  gate.resolve(
    response({
      success: true,
      data: { schemaVersion: 1, payloadHash: 'c'.repeat(64), quote: checkoutQuote() },
    }),
  );
  await first;
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});
it('unknown submission remains pending; unseen recovery does not submit again and cancellation seals the attempt', async () => {
  const f = await fixture();
  const fetch = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation(async (url, options) => {
    if (url.endsWith('/submit')) throw new Error('Response lost');
    return fetch(url, options);
  });
  await expect(f.subject.submit(f.input)).rejects.toMatchObject({ reason: 'network' });
  expect(await f.subject.pending()).toEqual({ cancelling: false, canResume: true });
  await expect(f.subject.submit(f.input)).rejects.toThrow();
  f.fetcher.mockResolvedValueOnce(
    response({ success: true, data: { ...appliedOrder(), outcome: 'Unseen', orderId: null } }),
  );
  expect((await f.subject.recover('en')).outcome).toBe('Unseen');
  expect(await f.subject.pending()).not.toBeNull();
  f.fetcher.mockResolvedValueOnce(
    response({ success: true, data: { ...appliedOrder(), outcome: 'Cancelled', orderId: null } }),
  );
  expect((await f.subject.cancel('en')).outcome).toBe('Cancelled');
  expect(await f.subject.pending()).toBeNull();
  expect(f.fetcher.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
    '/api/customer-mobile/checkout/prepare',
    '/api/customer-mobile/checkout/submit',
    '/api/customer-mobile/checkout/recover',
    '/api/customer-mobile/checkout/cancel',
  ]);
});
it('failed cleanup finishes from validated in-memory acceptance without another network request', async () => {
  const f = await fixture();
  const key = secretKey(f.context, 'order-operation-proof', f.principal);
  const remove = f.store.remove.bind(f.store);
  let fail = true;
  jest.spyOn(f.store, 'remove').mockImplementation(async (name) => {
    if (name === key && fail) {
      fail = false;
      throw new Error('Secure cleanup failed');
    }
    await remove(name);
  });
  await expect(f.subject.submit(f.input)).rejects.toThrow('Secure cleanup');
  await expect(f.subject.recover('en')).resolves.toEqual(appliedOrder());
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  expect(await f.subject.pending()).toBeNull();
});
it('snapshots contact and review before the first asynchronous credential read', async () => {
  const f = await fixture();
  const gate = deferred<string | null>();
  jest.spyOn(f.repository.vault, 'capability').mockReturnValueOnce(gate.promise);
  const pending = f.subject.submit(f.input);
  f.input.intent.contact.name = 'Changed later';
  f.input.reviewed.items[0]!.quantity = 99;
  gate.resolve(f.request.sessionId);
  await pending;
  expect(f.fetcher.mock.calls[0]![1].body).not.toContain('Changed later');
});
it('logout during dispatch withdraws a late acceptance while retaining only the minimal original proof', async () => {
  const f = await fixture(true);
  const dispatched = deferred<void>();
  const result = deferred<Response>();
  const fetch = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation(async (url, options) => {
    if (url.endsWith('/submit')) {
      dispatched.resolve();
      return result.promise;
    }
    return fetch(url, options);
  });
  const pending = f.subject.submit(f.input);
  await dispatched.promise;
  await f.sessions.logout();
  result.resolve(response({ success: true, data: appliedOrder() }));
  await expect(pending).rejects.toThrow();
  const loaded = await f.repository.orders.load(f.context, f.principal, currentBasketOwner);
  expect(loaded?.intent).toBeNull();
  expect(loaded?.proof.operationId).toBe(basketOperationId);
  expect(await f.repository.orders.decisions(f.context, f.principal, currentBasketOwner)).toEqual(
    [],
  );
});
it('disposed controllers and empty recovery cannot dispatch an order', async () => {
  const f = await fixture();
  await expect(f.subject.recover('en')).rejects.toThrow();
  await expect(f.subject.cancel('en')).rejects.toThrow();
  f.subject.dispose();
  expect(() => f.subject.submit(f.input)).toThrow();
  await expect(f.subject.pending()).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
});
