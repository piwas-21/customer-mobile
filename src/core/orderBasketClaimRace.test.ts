import { CustomerOrderController } from './customerOrderController';
import { checkoutQuoteFixture, checkoutQuote } from '../test/checkoutQuote';
import { checkoutIntent, appliedOrder } from '../test/customerOrder';
import { basketInput, basketOperationId, currentBasketOwner } from '../test/basketOperations';
import { basketResponse } from '../test/basketApi';
import { deferred } from '../test/deferred';
import { response } from '../test/transport';
async function fixture() {
  const f = await checkoutQuoteFixture();
  const orders = new CustomerOrderController(
    f.context,
    f.client,
    f.repository,
    f.sessions,
    f.principal,
    () => basketOperationId,
  );
  const input = { ...f.request, intent: checkoutIntent() };
  return { ...f, orders, input };
}
it('a basket claim made while another controller awaits order preparation prevents order dispatch', async () => {
  const f = await fixture();
  const prepareStarted = deferred<void>();
  const prepared = deferred<Response>();
  const basketStarted = deferred<void>();
  const basketReply = deferred<Response>();
  f.fetcher.mockImplementation(async (url) => {
    if (url.includes('/bootstrap?')) return response({ success: true, data: f.bootstrap });
    if (url.endsWith('/checkout/prepare')) {
      prepareStarted.resolve();
      return prepared.promise;
    }
    if (url.endsWith('/basket/items')) {
      basketStarted.resolve();
      return basketReply.promise;
    }
    throw new Error('Unexpected order dispatch');
  });
  const order = f.orders.submit(f.input);
  await prepareStarted.promise;
  const basket = f.subject.add(basketInput, 'en');
  await basketStarted.promise;
  prepared.resolve(
    response({
      success: true,
      data: { schemaVersion: 1, payloadHash: 'c'.repeat(64), quote: checkoutQuote() },
    }),
  );
  await expect(order).rejects.toThrow('pending basket');
  expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/checkout/submit'))).toBe(false);
  expect(await f.repository.orders.load(f.context, f.principal, currentBasketOwner)).toBeNull();
  basketReply.resolve(response({ success: true, data: basketResponse() }));
  await basket;
});
it('an order claim made while another controller awaits bootstrap prevents basket dispatch', async () => {
  const f = await fixture();
  const bootstrapStarted = deferred<void>();
  const bootstrap = deferred<Response>();
  const orderStarted = deferred<void>();
  const orderReply = deferred<Response>();
  f.fetcher.mockImplementation(async (url) => {
    if (url.includes('/bootstrap?')) {
      bootstrapStarted.resolve();
      return bootstrap.promise;
    }
    if (url.endsWith('/checkout/prepare'))
      return response({
        success: true,
        data: { schemaVersion: 1, payloadHash: 'c'.repeat(64), quote: checkoutQuote() },
      });
    if (url.endsWith('/checkout/submit')) {
      orderStarted.resolve();
      return orderReply.promise;
    }
    throw new Error('Unexpected basket dispatch');
  });
  const basket = f.subject.add(basketInput, 'en');
  await bootstrapStarted.promise;
  const order = f.orders.submit(f.input);
  await orderStarted.promise;
  bootstrap.resolve(response({ success: true, data: f.bootstrap }));
  await expect(basket).rejects.toThrow('pending order');
  expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/basket/items'))).toBe(false);
  expect(await f.repository.baskets.load(f.context, f.principal, currentBasketOwner)).toBeNull();
  orderReply.resolve(response({ success: true, data: appliedOrder() }));
  await order;
});
