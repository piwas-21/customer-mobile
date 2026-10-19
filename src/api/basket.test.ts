import { submitBasketOperation } from './basket';
import { basketApiFixture, basketResponse } from '../test/basketApi';
import { response } from '../test/transport';
import { tenantA, tenantB } from '../test/fixtures';
import { basketOperationId, basketInput, currentBasketOwner } from '../test/basketOperations';
import { session } from '../test/sessions';

it('preserves a server removal credit separately from nonnegative payable totals', async () => {
  const { client, context, pending, fetcher } = await basketApiFixture();
  const basket = basketResponse();
  basket.items[0] = { ...basket.items[0]!, customizationPrice: -1.5, itemTotal: 11 };
  basket.subTotal = 11;
  basket.total = 14.2;
  fetcher.mockResolvedValue(response({ success: true, data: basket }));
  const accepted = await submitBasketOperation(client, context, pending, currentBasketOwner, 'en');
  expect(accepted.items[0]?.customizationPrice).toBe(-1.5);
  expect(accepted.items[0]?.itemTotal).toBe(11);
  expect(accepted.total).toBe(14.2);
});

it('uses only the dedicated route, exact operation and server totals; leaves acknowledgement to the controller', async () => {
  const { client, context, pending, fetcher, repository, principal } = await basketApiFixture();
  fetcher.mockResolvedValue(response({ success: true, data: basketResponse() }));
  const basket = await submitBasketOperation(client, context, pending, currentBasketOwner, 'fr');
  expect(basket.total).toBe(17.2);
  expect(basket.items[0]?.removedIngredientNames).toEqual(['Onion']);
  expect(fetcher.mock.calls[0]?.[0]).toBe(
    `${context.tenant.apiOrigin}/api/customer-mobile/basket/items`,
  );
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
    method: 'POST',
    headers: {
      'X-Session-Id': pending.sessionId,
      'Accept-Language': 'fr',
    },
    body: JSON.stringify({ ...basketInput, operationId: basketOperationId }),
  });
  expect(await repository.baskets.load(context, principal, currentBasketOwner)).toEqual(pending);
});

it('accepts the same customer basket from an earlier web session, with scoped customer and basket credentials', async () => {
  const fixture = await basketApiFixture({ kind: 'customer', id: session.userId });
  await fixture.repository.vault.saveSession(fixture.context, session);
  const basket = { ...basketResponse(session.userId), sessionId: 'earlier-web-session' };
  fixture.fetcher.mockResolvedValue(response({ success: true, data: basket }));
  await expect(
    submitBasketOperation(
      fixture.client,
      fixture.context,
      fixture.pending,
      currentBasketOwner,
      'en',
    ),
  ).resolves.toMatchObject({ userId: session.userId });
  expect(fixture.fetcher.mock.calls[0]?.[1].headers?.Authorization).toBe('Bearer old-access');
});

it.each([
  { userId: tenantA },
  { sessionId: 'different-session' },
  { id: '00000000-0000-0000-0000-000000000000' },
  { purchaseFingerprint: '' },
  { total: '17.2' },
  { total: -1 },
  { orderType: 'Future' },
  { items: [{ ...basketResponse().items[0], childItems: [{ quantity: -1 }] }] },
])(
  'rejects unowned or incomplete server proof %j without retry or journal cleanup',
  async (changes) => {
    const { client, context, pending, fetcher, repository, principal } = await basketApiFixture();
    fetcher.mockResolvedValue(
      response({ success: true, data: { ...basketResponse(), ...changes } }),
    );
    await expect(
      submitBasketOperation(client, context, pending, currentBasketOwner, 'en'),
    ).rejects.toMatchObject({ reason: 'contract' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await repository.baskets.load(context, principal, currentBasketOwner)).toEqual(pending);
  },
);

it('rejects another customer even with the expected session', async () => {
  const fixture = await basketApiFixture({ kind: 'customer', id: session.userId });
  await fixture.repository.vault.saveSession(fixture.context, session);
  fixture.fetcher.mockResolvedValue(response({ success: true, data: basketResponse(tenantB) }));
  await expect(
    submitBasketOperation(
      fixture.client,
      fixture.context,
      fixture.pending,
      currentBasketOwner,
      'en',
    ),
  ).rejects.toMatchObject({ reason: 'contract' });
});

it.each([401, 404, 409, 503])(
  'keeps the exact operation on HTTP %s without a legacy fallback',
  async (status) => {
    const { client, context, pending, fetcher } = await basketApiFixture();
    fetcher.mockResolvedValue(response({}, status));
    await expect(
      submitBasketOperation(client, context, pending, currentBasketOwner, 'en'),
    ).rejects.toMatchObject({ status });
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

it('rejects an installing record or different restaurant before dispatch', async () => {
  const { client, context, pending, fetcher } = await basketApiFixture();
  for (const changes of [
    { phase: 'installing' as const },
    { tenantId: tenantB },
    { environment: 'production' as const },
  ]) {
    await expect(
      submitBasketOperation(
        client,
        context,
        { ...pending, ...changes } as typeof pending,
        currentBasketOwner,
        'en',
      ),
    ).rejects.toMatchObject({ reason: 'refused' });
  }
  expect(fetcher).not.toHaveBeenCalled();
});
