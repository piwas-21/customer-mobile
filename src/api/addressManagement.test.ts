import {
  addressInputSchema,
  changeCustomerAddress,
  saveCustomerAddress,
} from './addressManagement';
import { savedAddress, addressId } from '../test/savedAddresses';
import { sessionSetup } from '../test/sessions';
import { tenantA, tenantB } from '../test/fixtures';
import { deferred } from '../test/deferred';
import { response } from '../test/transport';
const content = () => addressInputSchema.strip().parse(savedAddress());
const result = () => ({ schemaVersion: 1, address: savedAddress() });
it.each([false, true])(
  'saves with current credentials, exact review fields and method (editing=%s)',
  async (editing) => {
    const { controller, fetcher } = await sessionSetup();
    fetcher.mockResolvedValue(response({ success: true, data: result() }));
    await expect(
      saveCustomerAddress(controller, tenantA, content(), 'fr', editing ? addressId(1) : undefined),
    ).resolves.toEqual(savedAddress());
    const call = fetcher.mock.calls[0]!;
    expect(call[0]).toBe(
      `https://alpha.example/api/customer-mobile/account/addresses${editing ? '/' + addressId(1) : ''}`,
    );
    expect(call[1]).toMatchObject({
      method: editing ? 'PUT' : 'POST',
      headers: { Authorization: 'Bearer old-access' },
    });
    expect(JSON.parse(call[1].body!)).toEqual({ schemaVersion: 1, address: content() });
  },
);
it.each(['remove', 'default'] as const)(
  'confirms the exact %s effect for the requested address',
  async (action) => {
    const { controller, fetcher } = await sessionSetup();
    fetcher.mockResolvedValue(
      response({
        success: true,
        data: {
          schemaVersion: 1,
          addressId: addressId(1),
          state: action === 'remove' ? 'removed' : 'default',
        },
      }),
    );
    await changeCustomerAddress(controller, tenantA, addressId(1), action, 'fr');
    const call = fetcher.mock.calls[0]!;
    expect(call[0]).toBe(
      `https://alpha.example/api/customer-mobile/account/addresses/${addressId(1)}${action === 'default' ? '/set-default' : ''}`,
    );
    expect(call[1].method).toBe(action === 'remove' ? 'DELETE' : 'POST');
    expect(JSON.parse(call[1].body!)).toEqual({ schemaVersion: 1 });
  },
);
it.each([400, 401, 403, 409, 429, 500, 503])(
  'never renews or retries an address write on HTTP %s',
  async (status) => {
    const { controller, fetcher } = await sessionSetup();
    fetcher.mockResolvedValue(response({}, status));
    await expect(saveCustomerAddress(controller, tenantA, content(), 'fr')).rejects.toMatchObject({
      status,
      reason: 'http',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
it('does not retry a lost response or accept a withdrawn owner', async () => {
  const { controller, fetcher } = await sessionSetup();
  fetcher.mockRejectedValueOnce(new Error('connection lost'));
  await expect(saveCustomerAddress(controller, tenantA, content(), 'fr')).rejects.toMatchObject({
    reason: 'network',
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  await controller.logout();
  await expect(
    changeCustomerAddress(controller, tenantA, addressId(1), 'remove', 'fr'),
  ).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  { ...result(), schemaVersion: 2 },
  { ...result(), userId: tenantA },
  { ...result(), address: { ...savedAddress(), userId: tenantA } },
  { ...result(), address: { ...savedAddress(), latitude: 1 } },
  { ...result(), address: savedAddress(2) },
  { ...result(), address: { ...savedAddress(), label: 'Changed' } },
  { ...result(), address: { ...savedAddress(), isDefault: false } },
])('withdraws a malformed, private or contradictory update response %j', async (data) => {
  const { controller, fetcher } = await sessionSetup();
  fetcher.mockResolvedValue(response({ success: true, data }));
  await expect(
    saveCustomerAddress(controller, tenantA, content(), 'fr', addressId(1)),
  ).rejects.toMatchObject({ reason: 'contract' });
});
it.each([
  { schemaVersion: 1, addressId: addressId(2), state: 'removed' },
  { schemaVersion: 1, addressId: addressId(1), state: 'default' },
  { schemaVersion: 2, addressId: addressId(1), state: 'removed' },
])('refuses an action response for another target/effect/version %j', async (data) => {
  const { controller, fetcher } = await sessionSetup();
  fetcher.mockResolvedValue(response({ success: true, data }));
  await expect(
    changeCustomerAddress(controller, tenantA, addressId(1), 'remove', 'fr'),
  ).rejects.toMatchObject({ reason: 'contract' });
});
it('refuses invalid content and IDs before dispatch', async () => {
  const { controller, fetcher } = await sessionSetup();
  await expect(
    saveCustomerAddress(controller, tenantA, { ...content(), label: ' ' }, 'fr'),
  ).rejects.toThrow();
  await expect(
    saveCustomerAddress(controller, tenantA, { ...content(), label: 'x'.repeat(51) }, 'fr'),
  ).rejects.toThrow();
  await expect(
    saveCustomerAddress(controller, tenantA, { ...content(), city: 'City\0' }, 'fr'),
  ).rejects.toThrow();
  await expect(
    changeCustomerAddress(controller, tenantA, 'invalid', 'remove', 'fr'),
  ).rejects.toThrow();
  await expect(saveCustomerAddress(controller, tenantB, content(), 'fr')).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  expect(addressInputSchema.safeParse({ ...content(), userId: tenantB }).success).toBe(false);
  expect(addressInputSchema.safeParse({ ...content(), latitude: 1 }).success).toBe(false);
  expect(addressInputSchema.safeParse({ ...content(), label: '🏠'.repeat(50) }).success).toBe(true);
});
it.each(['logout', 'tenant'] as const)(
  'rejects a late successful write after %s withdrawal',
  async (mode) => {
    const { controller, fetcher, boundary } = await sessionSetup();
    const finish = deferred<Response>();
    const entered = deferred<void>();
    fetcher.mockImplementationOnce(() => {
      entered.resolve();
      return finish.promise;
    });
    const pending = saveCustomerAddress(controller, tenantA, content(), 'fr');
    await entered.promise;
    if (mode === 'logout') await controller.logout();
    else boundary.select(tenantB);
    finish.resolve(response({ success: true, data: result() }));
    await expect(pending).rejects.toThrow();
  },
);
