import { BasketWorkspace } from './basketWorkspace';
import { secretKey } from './credentials';
import { checkoutQuote, checkoutQuoteFixture } from '../test/checkoutQuote';
import { basketInput, currentBasketOwner } from '../test/basketOperations';
import { response } from '../test/transport';
async function fixture(customer = false) {
  const f = await checkoutQuoteFixture(customer);
  const workspace = new BasketWorkspace(
    f.context,
    f.client,
    f.repository,
    f.sessions,
    f.principal,
    f.createId,
  );
  return {
    ...f,
    workspace,
    review: () =>
      workspace.quote(f.request.reviewed, f.request.bootstrap, { pointsToRedeem: 0, tip: 3 }, 'en'),
  };
}
it.each([false, true])(
  'reviews the installed owner session without creating a pending change (customer=%s)',
  async (customer) => {
    const f = await fixture(customer);
    const stored = new Map(f.store.values);
    f.fetcher.mockResolvedValue(response({ success: true, data: checkoutQuote() }));
    await expect(f.review()).resolves.toEqual(checkoutQuote());
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect(f.store.values).toEqual(stored);
    await expect(f.workspace.hasPending()).resolves.toBe(false);
  },
);
it('refuses a review when no installed basket session exists rather than creating one', async () => {
  const f = await fixture();
  f.store.values.delete(secretKey(f.context, 'guest-session', f.principal));
  const stored = new Map(f.store.values);
  await expect(f.review()).rejects.toMatchObject({ status: 409, reason: 'refused' });
  expect(f.fetcher).not.toHaveBeenCalled();
  expect(f.store.values).toEqual(stored);
});
it('requires explicit resolution of a pending basket write before quoting', async () => {
  const f = await fixture();
  const pending = await f.repository.baskets.prepare(
    f.context,
    f.principal,
    basketInput,
    f.createId,
    currentBasketOwner,
  );
  await expect(f.review()).rejects.toMatchObject({ status: 409, reason: 'refused' });
  expect(f.fetcher).not.toHaveBeenCalled();
  expect(await f.repository.baskets.load(f.context, f.principal, currentBasketOwner)).toEqual(
    pending,
  );
});
it('captures basket roots, bootstrap and review choices before asynchronous session reads', async () => {
  const f = await fixture();
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  jest.spyOn(f.repository.vault, 'capability').mockImplementationOnce(async () => {
    enter();
    await gate;
    return f.request.sessionId;
  });
  f.fetcher.mockResolvedValue(response({ success: true, data: checkoutQuote() }));
  const selection = { pointsToRedeem: 0, tip: 3 };
  const work = f.workspace.quote(f.request.reviewed, f.request.bootstrap, selection, 'en');
  await entered;
  f.request.reviewed.items[0]!.quantity = 99;
  f.request.reviewed.purchaseFingerprint = 'c'.repeat(64);
  f.request.bootstrap.currency = 'EUR';
  selection.tip = 99;
  release();
  await expect(work).resolves.toEqual(checkoutQuote());
});
it.each(['dispose', 'logout'])(
  'withdraws a workspace during vault access after %s',
  async (change) => {
    const f = await fixture(true);
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    jest.spyOn(f.repository.vault, 'capability').mockImplementationOnce(async () => {
      enter();
      await gate;
      return f.request.sessionId;
    });
    const work = f.review();
    await entered;
    if (change === 'dispose') f.workspace.dispose();
    else await f.sessions.logout();
    release();
    await expect(work).rejects.toMatchObject({ reason: 'refused' });
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
