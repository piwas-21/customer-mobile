import { tablePaymentHoldsPurchases } from './tablePurchaseHold';
import { tablePaymentResolved } from './tablePaymentRecord';
import { TablePaymentStorage } from './tablePaymentStorage';
import { TableRoundStorage } from './tableRoundStorage';
import { ReservationOperationStorage } from './reservationOperationStorage';
import { z } from 'zod';
import type { SecretStore } from './credentials';
import { CancellationOperationStorage } from './cancellationOperationStorage';
import { OrderOperationStorage } from './orderOperationStorage';
import { PaymentOperationStorage } from './paymentOperationStorage';
import type { TenantContext } from './tenantContext';
const key = (context: TenantContext) =>
  `v2.${context.environment}.${context.tenant.id}.payment-attention`;
// All calls run within SessionRepository's shared storage queue.
export class PaymentAttentionStorage {
  constructor(private readonly store: SecretStore) {}
  async load(context: TenantContext): Promise<string | null> {
    const value = await this.store.get(key(context));
    return value === null ? null : z.uuid().parse(value);
  }
  async retainPending(context: TenantContext, userId: string): Promise<void> {
    const principal = { kind: 'customer', id: z.uuid().parse(userId) } as const;
    const orders = new OrderOperationStorage(this.store);
    const payments = new PaymentOperationStorage(this.store);
    const guard = () => {
      if (context.signal.aborted) throw new Error('Restaurant changed');
    };
    if (
      !(await orders.read(context, principal, guard)) &&
      (await payments.read(context, principal, guard))?.state !== 'pending' &&
      (await new CancellationOperationStorage(this.store).read(context, principal, guard))
        ?.resolution !== null &&
      (await new ReservationOperationStorage(this.store).read(context, principal, guard))
        ?.resolution !== null &&
      (await new TableRoundStorage(this.store).read(context, principal, guard))?.resolution !==
        null &&
      !(await tablePaymentHoldsPurchases(this.store, context, principal, guard))
    )
      return;
    await this.save(context, userId);
  }
  async retainCancellation(context: TenantContext, userId: string): Promise<void> {
    const principal = { kind: 'customer', id: z.uuid().parse(userId) } as const;
    const contribution = await new TablePaymentStorage(this.store).readForCleanup(
      context,
      principal,
    );
    if (
      (contribution !== null && !tablePaymentResolved(contribution)) ||
      (await new CancellationOperationStorage(this.store).readForCleanup(context, principal))
        ?.resolution === null ||
      (await new TableRoundStorage(this.store).readForCleanup(context, principal))?.resolution ===
        null
    )
      await this.save(context, userId);
  }
  private async save(context: TenantContext, userId: string): Promise<void> {
    await this.store.set(key(context), userId);
    if ((await this.load(context)) !== userId) throw new Error('Payment reminder save incomplete');
  }
  async dismiss(context: TenantContext): Promise<void> {
    await this.store.remove(key(context));
    if ((await this.load(context)) !== null) throw new Error('Payment reminder removal incomplete');
  }
}
