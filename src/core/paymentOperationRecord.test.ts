import { paymentFixture as acceptedOnline } from '../test/customerPayment';
import { basketInput, currentBasketOwner } from '../test/basketOperations';
import { tenantB } from '../test/fixtures';
import { secretKey } from './credentials';
it.each(['environment', 'tenant', 'principal', 'malformed'])(
  'malformed or substituted payment scope %s cannot unblock a purchase',
  async (scenario) => {
    const f = await acceptedOnline();
    const proof = {
      ...f.record.proof,
      ...(scenario === 'environment'
        ? { environment: 'production' }
        : scenario === 'tenant'
          ? { tenantId: tenantB }
          : scenario === 'principal'
            ? { principal: { kind: 'customer', id: 'other' } }
            : {}),
    };
    await f.store.set(
      secretKey(f.context, 'payment', f.principal),
      scenario === 'malformed' ? 'bad-json' : JSON.stringify({ ...f.record, proof }),
    );
    await expect(
      f.repository.baskets.prepare(
        f.context,
        f.principal,
        basketInput,
        () => tenantB,
        currentBasketOwner,
      ),
    ).rejects.toThrow();
  },
);
