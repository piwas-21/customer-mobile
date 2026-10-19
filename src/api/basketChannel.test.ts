import { basketChannelInputSchema, basketChannelRequest, readOrderTypes } from './basketChannel';
import { channelInput } from '../test/basketChannels';
import { basketControllerFixture } from '../test/basketController';
import { basketOperationId } from '../test/basketOperations';
import { response } from '../test/transport';
import { tenantA } from '../test/fixtures';
import { emptyUuid } from '../core/identifiers';
it.each([false, true])('builds an exact typed channel request (empty basket: %s)', (empty) => {
  expect(basketChannelRequest(channelInput(empty), basketOperationId)).toEqual({
    path: '/api/customer-mobile/basket/channel',
    body: { ...channelInput(empty), operationId: basketOperationId },
  });
});
it.each([
  { expectedBasketId: emptyUuid },
  { expectedPurchaseFingerprint: '' },
  { expectedPurchaseFingerprint: 'invalid' },
  { orderType: 'FutureType' },
  { confirmedConflictItemIds: [tenantA, tenantA] },
  { confirmedConflictItemIds: [emptyUuid] },
  { confirmedConflictItemIds: null },
  { price: 1 },
])('refuses an invalid or expanded channel intent %j', (patch) => {
  expect(basketChannelInputSchema.safeParse({ ...channelInput(), ...patch }).success).toBe(false);
});
it('never confirms removals from a basket that did not exist', () => {
  expect(
    basketChannelInputSchema.safeParse({
      ...channelInput(true),
      confirmedConflictItemIds: [tenantA],
    }).success,
  ).toBe(false);
  expect(() => basketChannelRequest(channelInput(), emptyUuid)).toThrow();
});
it('bounds removals without truncating or accepting duplicate identities', () => {
  const ids = Array.from(
    { length: 1000 },
    (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  );
  expect(
    basketChannelInputSchema.parse({ ...channelInput(), confirmedConflictItemIds: ids })
      .confirmedConflictItemIds,
  ).toHaveLength(1000);
  expect(
    basketChannelInputSchema.safeParse({
      ...channelInput(),
      confirmedConflictItemIds: [...ids, tenantA],
    }).success,
  ).toBe(false);
});
it('reads exact enabled types and refuses unknown or duplicate channels', async () => {
  const f = await basketControllerFixture();
  for (const invalid of [['FutureType'], ['Takeaway', 'Takeaway']]) {
    f.fetcher.mockResolvedValueOnce(response({ success: true, data: invalid }));
    await expect(readOrderTypes(f.client, f.context)).rejects.toMatchObject({ reason: 'contract' });
  }
  f.fetcher.mockResolvedValueOnce(response({ success: true, data: ['Takeaway', 'Delivery'] }));
  await expect(readOrderTypes(f.client, f.context)).resolves.toEqual(['Takeaway', 'Delivery']);
  expect(
    f.fetcher.mock.calls.every(
      ([url, request]) =>
        url.endsWith('/api/OrderTypeConfiguration/enabled') && request.method === 'GET',
    ),
  ).toBe(true);
});
