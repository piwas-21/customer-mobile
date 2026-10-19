import { customerAddressPageSchema, readCustomerAddresses } from './customerAddresses';
import { sessionSetup, authResponse } from '../test/sessions';
import { addressId, savedAddress, addressPage } from '../test/savedAddresses';
import { response } from '../test/transport';
import { tenantA, tenantB } from '../test/fixtures';
import { deferred } from '../test/deferred';
it('uses current owner authentication and fixed-version cursor navigation without a selected user ID', async () => {
  const { controller, fetcher } = await sessionSetup();
  const data = addressPage([savedAddress(21)]);
  fetcher.mockResolvedValue(response({ success: true, data }));
  await expect(readCustomerAddresses(controller, tenantA, addressId(20))).resolves.toEqual(data);
  expect(fetcher.mock.calls[0]?.[0]).toBe(
    `https://alpha.example/api/customer-mobile/account/addresses?schemaVersion=1&afterId=${addressId(20)}`,
  );
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
    method: 'GET',
    headers: { Authorization: 'Bearer old-access' },
  });
  expect(fetcher.mock.calls[0]?.[1].body).toBeUndefined();
});
it.each([
  addressPage(Array.from({ length: 21 }, (_, index) => savedAddress(index + 1))),
  addressPage([savedAddress(2), savedAddress(1)]),
  addressPage([savedAddress(1), savedAddress(1)]),
  addressPage([], addressId(20)),
  addressPage([savedAddress()], addressId(1)),
  { ...addressPage(), schemaVersion: 2 },
  { ...addressPage(), userId: tenantB },
  { ...addressPage(), items: [{ ...savedAddress(), userId: tenantB }] },
  addressPage([savedAddress(1, { label: 'x'.repeat(51) })]),
])('rejects unbounded, contradictory, unordered or private response data %j', (data) => {
  expect(customerAddressPageSchema.safeParse(data).success).toBe(false);
});
it('accepts an exact full page with its original cursor and nullable optional fields', () => {
  const data = addressPage(
    Array.from({ length: 20 }, (_, index) => savedAddress(index + 1)),
    addressId(20),
  );
  expect(customerAddressPageSchema.parse(data)).toEqual(data);
  expect(
    customerAddressPageSchema.parse(
      addressPage([
        savedAddress(1, {
          label: 'x'.repeat(50),
          addressLine2: null,
          phone: null,
          deliveryInstructions: null,
        }),
      ]),
    ),
  ).toBeTruthy();
});
it('refuses a regressing cursor response, invalid cursor and foreign current principal', async () => {
  const { controller, fetcher } = await sessionSetup();
  fetcher.mockResolvedValue(response({ success: true, data: addressPage() }));
  await expect(readCustomerAddresses(controller, tenantA, addressId(20))).rejects.toMatchObject({
    reason: 'contract',
  });
  await expect(readCustomerAddresses(controller, tenantA, 'invalid')).rejects.toThrow();
  await expect(readCustomerAddresses(controller, tenantB)).rejects.toMatchObject({
    reason: 'refused',
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('renews an expired read once, then refuses a late result after a tenant switch', async () => {
  const { controller, fetcher, boundary } = await sessionSetup();
  fetcher
    .mockResolvedValueOnce(response({}, 401))
    .mockResolvedValueOnce(authResponse())
    .mockResolvedValueOnce(response({ success: true, data: addressPage() }));
  await expect(readCustomerAddresses(controller, tenantA)).resolves.toEqual(addressPage());
  expect(fetcher).toHaveBeenCalledTimes(3);
  const finish = deferred<Response>();
  const entered = deferred<void>();
  fetcher.mockImplementationOnce(() => {
    entered.resolve();
    return finish.promise;
  });
  const pending = readCustomerAddresses(controller, tenantA);
  await entered.promise;
  boundary.select(tenantB);
  finish.resolve(response({ success: true, data: addressPage() }));
  await expect(pending).rejects.toThrow();
});

it('counts database character limits as Unicode code points for existing labels', () => {
  expect(
    customerAddressPageSchema.safeParse(addressPage([savedAddress(1, { label: '🏠'.repeat(50) })]))
      .success,
  ).toBe(true);
  expect(
    customerAddressPageSchema.safeParse(addressPage([savedAddress(1, { label: '🏠'.repeat(51) })]))
      .success,
  ).toBe(false);
});
