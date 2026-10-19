import { z } from 'zod';
import { savedOrderFixture } from '../test/orderReceipt';
import { decisionProof } from './orderDecisions';
import { tenantB } from '../test/fixtures';
import { secretKey } from './credentials';
import { response } from '../test/transport';
it.each([
  'guest',
  'forgotten',
  'wrong-hash',
  'wrong-principal',
  'missing-owner',
  'wrong-method',
  'wrong-route',
] as const)('receipt-only credential renewal refuses %s before any packet', async (mode) => {
  const f = await savedOrderFixture(mode !== 'guest');
  const proof = decisionProof(f.decision);
  if (mode === 'forgotten')
    await f.store.remove(secretKey(f.context, 'order-decisions', f.principal));
  f.fetcher.mockResolvedValue(response({ success: true, data: {} }));
  await expect(
    f.client.request(
      f.context,
      mode === 'wrong-route' ? '/api/Auth/login' : '/api/Auth/refresh-token',
      z.unknown(),
      {
        method: mode === 'wrong-method' ? 'GET' : 'POST',
        credentials: 'receipt-renewal',
        principal: mode === 'wrong-principal' ? { kind: 'customer', id: tenantB } : f.principal,
        expectedOrderProof:
          mode === 'wrong-hash' ? { ...proof, payloadHash: 'a'.repeat(64) } : proof,
        ...(mode === 'missing-owner' ? {} : { assertCurrent: () => undefined }),
      },
    ),
  ).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
});
