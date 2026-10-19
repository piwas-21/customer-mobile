import { BasketWorkspace } from './basketWorkspace';
import { emptyUuid } from './identifiers';
import { basketControllerFixture } from '../test/basketController';
import { basketResponse } from '../test/basketApi';
import { existingBasketSession } from '../test/basketMutations';
import { basketSessionId } from '../test/basketOperations';
import { response } from '../test/transport';
async function fixture() {
  const f = await basketControllerFixture();
  return {
    ...f,
    workspace: new BasketWorkspace(
      f.context,
      f.client,
      f.repository,
      f.sessions,
      f.principal,
      f.createId,
    ),
  };
}
const emptyPreview = {
  basketId: emptyUuid,
  purchaseFingerprint: '',
  orderType: 'Takeaway',
  conflicts: [],
};
it('previews a pristine installation without creating an ID, session, journal or HTTP request', async () => {
  const f = await fixture();
  await expect(f.workspace.previewChannel(null, 'Takeaway', 'en')).resolves.toEqual(emptyPreview);
  expect(f.store.values.size).toBe(0);
  expect(f.fetcher).not.toHaveBeenCalled();
});
it('refuses an existing reviewed basket when its session is missing', async () => {
  const f = await fixture();
  await expect(
    f.workspace.previewChannel(basketResponse(), 'Takeaway', 'en'),
  ).rejects.toMatchObject({ status: 409 });
  expect(f.fetcher).not.toHaveBeenCalled();
  expect(f.store.values.size).toBe(0);
});
it('reads the installed session even when the server basket has not been created', async () => {
  const f = await fixture();
  await existingBasketSession(f);
  f.fetcher.mockResolvedValue(response({ success: true, data: emptyPreview }));
  await expect(f.workspace.previewChannel(null, 'Takeaway', 'fr')).resolves.toEqual(emptyPreview);
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  const request = f.fetcher.mock.calls[0]![1];
  expect(request.method).toBe('GET');
  expect(request.headers?.['X-Session-Id']).toBe(basketSessionId);
  expect(request.headers?.['Accept-Language']).toBe('fr');
  expect(await f.workspace.hasPending()).toBe(false);
});
it('captures the complete reviewed rows before asynchronous vault access', async () => {
  const f = await fixture();
  await existingBasketSession(f);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  jest.spyOn(f.repository.vault, 'capability').mockImplementationOnce(async () => {
    await gate;
    return basketSessionId;
  });
  const reviewed = basketResponse();
  const preview = {
    basketId: reviewed.id,
    purchaseFingerprint: reviewed.purchaseFingerprint,
    orderType: 'Takeaway',
    conflicts: [
      {
        basketItemId: reviewed.items[0]!.id,
        productName: 'Meal',
        quantity: 2,
        allowedOrderTypes: ['DineIn'],
      },
    ],
  };
  f.fetcher.mockResolvedValue(response({ success: true, data: preview }));
  const work = f.workspace.previewChannel(reviewed, 'Takeaway', 'en');
  reviewed.items[0]!.quantity = 99;
  reviewed.purchaseFingerprint = 'B'.repeat(64);
  release();
  await expect(work).resolves.toEqual(preview);
  expect(await f.workspace.hasPending()).toBe(false);
});
it('refuses a withdrawn workspace across vault access before dispatch', async () => {
  const f = await fixture();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  jest.spyOn(f.repository.vault, 'capability').mockImplementationOnce(async () => {
    await gate;
    return basketSessionId;
  });
  const work = f.workspace.previewChannel(null, 'Takeaway', 'en');
  f.workspace.dispose();
  release();
  await expect(work).rejects.toMatchObject({ reason: 'refused' });
  expect(f.fetcher).not.toHaveBeenCalled();
});
