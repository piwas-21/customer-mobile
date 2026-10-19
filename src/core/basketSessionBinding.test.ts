import { z } from 'zod';
import { submitBasketOperation } from '../api/basket';
import { basketApiFixture } from '../test/basketApi';
import { basketSessionId, currentBasketOwner } from '../test/basketOperations';
import { deferred } from '../test/deferred';
import { tenantB } from '../test/fixtures';
import { session } from '../test/sessions';
import { setup } from '../test/transport';
import type { RequestOptions } from './httpTypes';

it('refuses a different valid basket capability installed after preparation', async () => {
  const { client, context, pending, repository, principal, fetcher } = await basketApiFixture();
  await repository.vault.saveCapability(context, 'guest-session', principal, tenantB);
  await expect(
    submitBasketOperation(client, context, pending, currentBasketOwner, 'en'),
  ).rejects.toMatchObject({ reason: 'refused' });
  expect(fetcher).not.toHaveBeenCalled();
});

it('captures the intended basket session before a delayed customer credential read', async () => {
  const { client, context, pending, repository, principal, fetcher } = await basketApiFixture({
    kind: 'customer',
    id: session.userId,
  });
  const loaded = deferred<typeof session>();
  jest.spyOn(repository.vault, 'session').mockReturnValueOnce(loaded.promise);
  const options: RequestOptions = {
    credentials: 'basket',
    principal,
    expectedBasketSessionId: pending.sessionId,
  };
  const request = client.request(context, '/api/customer-mobile/basket/items', z.string(), options);
  await repository.vault.saveCapability(context, 'guest-session', principal, tenantB);
  options.expectedBasketSessionId = tenantB;
  loaded.resolve(session);
  await expect(request).rejects.toMatchObject({ reason: 'refused' });
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([
  { credentials: 'none' as const, expectedBasketSessionId: basketSessionId },
  { credentials: 'guest' as const, expectedBasketSessionId: basketSessionId },
  { credentials: 'basket' as const, expectedBasketSessionId: 'bad-session' },
])('requires a canonical expected identity in basket mode %j', async (options) => {
  const { client, context, fetcher } = setup();
  await expect(client.request(context, '/api/basket', z.string(), options)).rejects.toMatchObject({
    reason: 'refused',
  });
  expect(fetcher).not.toHaveBeenCalled();
});
