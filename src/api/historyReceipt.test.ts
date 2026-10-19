import { historyReceiptSchema, readHistoryReceipt } from './historyReceipt';
import { receiptResponse } from '../test/orderReceipt';
import { sessionSetup } from '../test/sessions';
import { response } from '../test/transport';
import { tenantA } from '../test/fixtures';
import { addressId } from '../test/savedAddresses';
it('reads an owned historical receipt through its guarded current customer without local operation proof', async () => {
  const f = await sessionSetup();
  const receipt = { ...receiptResponse(), orderId: addressId(1) };
  f.fetcher.mockResolvedValue(response({ success: true, data: receipt }));
  await expect(readHistoryReceipt(f.controller, tenantA, receipt.orderId)).resolves.toEqual(
    receipt,
  );
  const [url, options] = f.fetcher.mock.calls[0]!;
  expect(new URL(url).pathname).toBe('/api/customer-mobile/orders/' + receipt.orderId);
  expect(new URL(url).searchParams.get('schemaVersion')).toBe('1');
  expect(options.method).toBe('GET');
  expect(options.headers?.Authorization).toBe('Bearer old-access');
});
it('accepts legacy missing currency without replacing it or manufacturing an immutable snapshot', () => {
  const value = { ...receiptResponse(), currency: null };
  expect(historyReceiptSchema.parse(value)).toEqual(value);
});
it.each([
  { currency: 'invalid' },
  { currency: 'eur' },
  { schemaVersion: 2 },
  { customerEmail: 'private@example.test' },
  { payloadHash: 'private-proof' },
  { businessTimeZoneId: 'Invalid/Zone' },
  { payableTotal: -1 },
  { remainingAmount: 1.001 },
])('refuses incompatible/private receipt fields %j', (patch) => {
  expect(historyReceiptSchema.safeParse({ ...receiptResponse(), ...patch }).success).toBe(false);
});
it('refuses a substituted receipt and invalid target before publication', async () => {
  const f = await sessionSetup();
  f.fetcher.mockResolvedValue(
    response({ success: true, data: { ...receiptResponse(), orderId: addressId(2) } }),
  );
  await expect(readHistoryReceipt(f.controller, tenantA, addressId(1))).rejects.toMatchObject({
    reason: 'contract',
  });
  await expect(readHistoryReceipt(f.controller, tenantA, 'invalid')).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it('refuses a withdrawn or different customer before issuing the private request', async () => {
  const f = await sessionSetup();
  await expect(readHistoryReceipt(f.controller, addressId(2), addressId(1))).rejects.toThrow();
  f.controller.dispose();
  await expect(readHistoryReceipt(f.controller, tenantA, addressId(1))).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
});
