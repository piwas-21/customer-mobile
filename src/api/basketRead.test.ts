import { readBasket } from './basket';
import { emptyBasketId } from './basketOwnership';
import { basketApiFixture, basketResponse } from '../test/basketApi';
import { response } from '../test/transport';
import { tenantA, tenantB } from '../test/fixtures';
import { session } from '../test/sessions';
const empty = () => ({
  id: emptyBasketId,
  userId: null,
  sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  subTotal: 0,
  tax: 0,
  deliveryFee: 0,
  discount: 0,
  customerDiscount: 0,
  total: 0,
  totalItems: 0,
  orderType: null,
  purchaseFingerprint: '',
  items: [],
});
it('reads the exact guest basket and retains the unresolved operation journal', async () => {
  const fixture = await basketApiFixture();
  fixture.fetcher.mockResolvedValueOnce(response({ success: true, data: basketResponse() }));
  const result = await readBasket(
    fixture.client,
    fixture.context,
    fixture.principal,
    fixture.pending.sessionId,
    () => undefined,
    'fr',
  );
  expect(result.id).toBe(basketResponse().id);
  expect(fixture.fetcher.mock.calls[0]?.[1].method).toBe('GET');
  expect(fixture.fetcher.mock.calls[0]?.[0]).toContain('/api/customer-mobile/basket');
  expect(fixture.fetcher.mock.calls[0]?.[1].headers?.['X-Session-Id']).toBe(
    fixture.pending.sessionId,
  );
  expect(fixture.fetcher.mock.calls[0]?.[1].headers).not.toHaveProperty('Authorization');
  expect(
    await fixture.repository.baskets.load(fixture.context, fixture.principal, () => undefined),
  ).toEqual(fixture.pending);
});
it('accepts only the server-defined nil empty basket envelope for missing baskets', async () => {
  const fixture = await basketApiFixture();
  fixture.fetcher.mockResolvedValueOnce(response({ success: true, data: empty() }));
  await expect(
    readBasket(
      fixture.client,
      fixture.context,
      fixture.principal,
      fixture.pending.sessionId,
      () => undefined,
      'en',
    ),
  ).resolves.toEqual(empty());
});
it('accepts the signed-in customer basket across its older web session and rejects another owner', async () => {
  const fixture = await basketApiFixture({ kind: 'customer', id: session.userId });
  await fixture.repository.activate(fixture.context, session, () => true);
  const current = { ...basketResponse(session.userId), sessionId: tenantA };
  fixture.fetcher.mockResolvedValueOnce(response({ success: true, data: current }));
  await expect(
    readBasket(
      fixture.client,
      fixture.context,
      fixture.principal,
      fixture.pending.sessionId,
      () => undefined,
      'en',
    ),
  ).resolves.toEqual(current);
  expect(fixture.fetcher.mock.calls[0]?.[1].headers?.Authorization).toBe('Bearer old-access');
  fixture.fetcher.mockResolvedValueOnce(response({ success: true, data: basketResponse(tenantB) }));
  await expect(
    readBasket(
      fixture.client,
      fixture.context,
      fixture.principal,
      fixture.pending.sessionId,
      () => undefined,
      'en',
    ),
  ).rejects.toMatchObject({ status: 200, reason: 'contract' });
});
it.each([
  { total: 1 },
  { tax: 1 },
  { customerDiscount: 1 },
  { totalItems: 1 },
  { userId: tenantA },
  { sessionId: tenantA },
  { purchaseFingerprint: 'A'.repeat(64) },
  { orderType: 'Takeaway' },
  { items: basketResponse().items },
])('refuses forged empty basket proof %j', async (patch) => {
  const fixture = await basketApiFixture();
  fixture.fetcher.mockResolvedValueOnce(
    response({ success: true, data: { ...empty(), ...patch } }),
  );
  await expect(
    readBasket(
      fixture.client,
      fixture.context,
      fixture.principal,
      fixture.pending.sessionId,
      () => undefined,
      'en',
    ),
  ).rejects.toMatchObject({ status: 200, reason: 'contract' });
});
it.each([{ userId: tenantA }, { sessionId: tenantA }])(
  'refuses foreign guest basket %j',
  async (patch) => {
    const fixture = await basketApiFixture();
    fixture.fetcher.mockResolvedValueOnce(
      response({ success: true, data: { ...basketResponse(), ...patch } }),
    );
    await expect(
      readBasket(
        fixture.client,
        fixture.context,
        fixture.principal,
        fixture.pending.sessionId,
        () => undefined,
        'en',
      ),
    ).rejects.toMatchObject({ status: 200 });
  },
);
it.each([401, 403, 404, 429, 503])(
  'does not retry a refused or unavailable read %s',
  async (status) => {
    const fixture = await basketApiFixture();
    fixture.fetcher.mockResolvedValueOnce(response({}, status));
    await expect(
      readBasket(
        fixture.client,
        fixture.context,
        fixture.principal,
        fixture.pending.sessionId,
        () => undefined,
        'en',
      ),
    ).rejects.toMatchObject({ status });
    expect(fixture.fetcher).toHaveBeenCalledTimes(1);
  },
);
it('captures the owner through credential loading and response decoding', async () => {
  const fixture = await basketApiFixture();
  const check = jest.fn(() => {
    throw new Error('Owner changed');
  });
  await expect(
    readBasket(
      fixture.client,
      fixture.context,
      fixture.principal,
      fixture.pending.sessionId,
      check,
      'en',
    ),
  ).rejects.toThrow('Owner changed');
  expect(fixture.fetcher).not.toHaveBeenCalled();
});
