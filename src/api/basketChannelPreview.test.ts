import { readBasketChannelPreview } from './basketChannelPreview';
import { basketControllerFixture } from '../test/basketController';
import { basketResponse } from '../test/basketApi';
import { existingBasketSession } from '../test/basketMutations';
import { currentBasketOwner } from '../test/basketOperations';
import { response } from '../test/transport';
import { tenantA } from '../test/fixtures';
function preview() {
  const basket = basketResponse();
  return {
    basketId: basket.id,
    purchaseFingerprint: basket.purchaseFingerprint,
    orderType: 'Takeaway',
    conflicts: [
      {
        basketItemId: basket.items[0]!.id,
        productName: 'Meal',
        quantity: 2,
        allowedOrderTypes: ['DineIn'],
      },
    ],
  };
}
async function setup() {
  const f = await basketControllerFixture();
  await existingBasketSession(f);
  return {
    ...f,
    request: {
      principal: f.principal,
      sessionId: basketResponse().sessionId,
      reviewed: basketResponse(),
      orderType: 'Takeaway' as const,
      locale: 'en',
    },
  };
}
it('reads a root conflict without writing, creating an operation or requiring an informational product ID', async () => {
  const f = await setup();
  f.fetcher.mockResolvedValue(response({ success: true, data: preview() }));
  await expect(
    readBasketChannelPreview(f.client, f.context, f.request, currentBasketOwner),
  ).resolves.toMatchObject(preview());
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  const [url, request] = f.fetcher.mock.calls[0]!;
  expect(url).toContain('/api/customer-mobile/basket/channel-preview?orderType=Takeaway');
  expect(request.method).toBe('GET');
  expect(request.headers?.['X-Session-Id']).toBe(f.request.sessionId);
  expect(request.headers?.Authorization).toBeUndefined();
  expect(await f.repository.baskets.load(f.context, f.principal, currentBasketOwner)).toBeNull();
});
it.each([
  { basketId: tenantA },
  { purchaseFingerprint: 'B'.repeat(64) },
  { orderType: 'Delivery' },
  { conflicts: [{ ...preview().conflicts[0], basketItemId: basketResponse().id }] },
  { conflicts: [{ ...preview().conflicts[0], quantity: 3 }] },
  { conflicts: [{ ...preview().conflicts[0], allowedOrderTypes: ['Takeaway'] }] },
  { conflicts: [preview().conflicts[0], preview().conflicts[0]] },
])('refuses a substituted, stale or contradictory preview %j', async (patch) => {
  const f = await setup();
  f.fetcher.mockResolvedValue(response({ success: true, data: { ...preview(), ...patch } }));
  await expect(
    readBasketChannelPreview(f.client, f.context, f.request, currentBasketOwner),
  ).rejects.toMatchObject({ reason: 'contract' });
  expect(await f.repository.baskets.load(f.context, f.principal, currentBasketOwner)).toBeNull();
});
it('captures the reviewed roots before asynchronous credential reads and refuses a foreign initial owner', async () => {
  const f = await setup();
  f.fetcher.mockResolvedValue(response({ success: true, data: preview() }));
  const result = readBasketChannelPreview(f.client, f.context, f.request, currentBasketOwner);
  f.request.reviewed.items[0]!.quantity = 99;
  await expect(result).resolves.toMatchObject(preview());
  f.fetcher.mockClear();
  await expect(
    readBasketChannelPreview(
      f.client,
      f.context,
      { ...f.request, reviewed: basketResponse(tenantA) },
      currentBasketOwner,
    ),
  ).rejects.toMatchObject({ reason: 'contract' });
  expect(f.fetcher).not.toHaveBeenCalled();
});
