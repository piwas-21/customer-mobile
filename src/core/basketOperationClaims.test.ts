import { basketControllerFixture } from '../test/basketController';
import {
  basketInput,
  basketPrincipal,
  basketOperationsFixture,
  currentBasketOwner,
} from '../test/basketOperations';
import { basketResponse } from '../test/basketApi';
import { response } from '../test/transport';
import { deferred } from '../test/deferred';

it('refuses a create-only claim inside the same queue that persists the operation', async () => {
  const { repository, context, createId } = basketOperationsFixture();
  const nextId = jest.fn(createId);
  const prepare = () =>
    repository.baskets.prepare(
      context,
      basketPrincipal,
      basketInput,
      nextId,
      currentBasketOwner,
      'create-only',
    );
  const results = await Promise.allSettled([prepare(), prepare()]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  expect(nextId).toHaveBeenCalledTimes(2);
  const pending = await repository.baskets.load(context, basketPrincipal, currentBasketOwner);
  expect(
    await repository.baskets.prepare(
      context,
      basketPrincipal,
      basketInput,
      nextId,
      currentBasketOwner,
    ),
  ).toEqual(pending);
  expect(nextId).toHaveBeenCalledTimes(2);
});

it('does not reinterpret two controller intents as one success', async () => {
  const { subject, controller, fetcher, bootstrap } = await basketControllerFixture();
  const entered = deferred<void>();
  const finish = deferred<void>();
  let posts = 0;
  fetcher.mockImplementation(async (url) => {
    if (url.includes('/bootstrap?')) return response({ success: true, data: bootstrap });
    if (++posts === 1) {
      entered.resolve();
      await finish.promise;
    }
    return response({ success: true, data: basketResponse() });
  });
  const first = subject.add(basketInput, 'en');
  const second = controller().add(basketInput, 'en');
  await entered.promise;
  try {
    await expect(second).rejects.toThrow();
    expect(posts).toBe(1);
  } finally {
    finish.resolve();
    await first;
  }
});
