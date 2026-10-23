import { PrivateOperationRepository } from './privateOperationRepository';
import { bindPreparedTablePayment } from '../api/tablePaymentPrepared';
import { bindTablePaymentResolution } from '../api/tablePaymentResolution';
import { bindTableCheckoutDecision } from '../api/tableCheckoutDecision';
import { ApiFailure } from './apiFailure';
import type { SecretStore } from './credentials';
import { installTablePayment } from './tablePaymentInstallation';
import {
  scopedTablePaymentPreparation,
  type TablePaymentPreparation,
} from './tablePaymentPreparation';
import {
  scopedTablePayment,
  tablePaymentResolved,
  type TablePaymentRecord,
} from './tablePaymentRecord';
import { TablePaymentStorage } from './tablePaymentStorage';
import type { SerialTasks } from './serialTasks';
import type { TenantContext } from './tenantContext';
export class TablePaymentRepository extends PrivateOperationRepository<TablePaymentRecord> {
  constructor(
    private readonly store: SecretStore,
    writes: SerialTasks,
  ) {
    super(new TablePaymentStorage(store), writes, tablePaymentResolved);
  }
  install(
    context: TenantContext,
    input: TablePaymentPreparation,
    value: unknown,
    guard: () => void,
  ) {
    const preparation = scopedTablePaymentPreparation(context, input.principal, input);
    const prepared = bindPreparedTablePayment(preparation.intent, preparation.currency, value);
    return this.writes.run(() =>
      installTablePayment(this.store, context, preparation, prepared, guard),
    );
  }
  finishResolution(
    context: TenantContext,
    input: TablePaymentRecord,
    value: unknown,
    guard: () => void,
  ) {
    const expected = scopedTablePayment(context, input.principal, input);
    const result = bindTablePaymentResolution(expected.intent, value, 'recover');
    return this.writes.run(async () => {
      const current = await this.unchanged(context, expected, guard);
      if (result.outcome === 'Unseen') {
        if (current.resolution) throw new ApiFailure(409, 'refused');
        return current;
      }
      if (
        current.resolution &&
        (current.resolution.outcome !== result.outcome ||
          current.resolution.attemptId !== result.attemptId)
      )
        throw new ApiFailure(409, 'refused');
      return this.storage.save(context, { ...current, resolution: result }, guard);
    });
  }
  finishCheckout(
    context: TenantContext,
    input: TablePaymentRecord,
    value: unknown,
    guard: () => void,
  ) {
    const expected = scopedTablePayment(context, input.principal, input);
    if (expected.resolution?.outcome !== 'Applied') throw new ApiFailure(409, 'refused');
    const decision = bindTableCheckoutDecision(
      {
        tenantId: expected.tenantId,
        operationId: expected.proof.operationId,
        serviceSessionId: expected.intent.serviceSessionId,
        attemptId: expected.resolution.attemptId,
        amountMinor: expected.review.amountMinor,
        currency: expected.review.currency,
        expiresAt: expected.checkout?.expiresAt ?? null,
      },
      value,
    );
    const checkout = {
      outcome: decision.outcome === 'ready' ? ('pending' as const) : decision.outcome,
      expiresAt: decision.expiresAt,
    };
    return this.writes.run(async () => {
      const current = await this.unchanged(context, expected, guard);
      if (tablePaymentResolved(current) && current.checkout?.outcome !== checkout.outcome)
        throw new ApiFailure(409, 'refused');
      // Never persist the hosted URL. A fresh original canonical read is required before opening.
      return this.storage.save(context, { ...current, checkout }, guard);
    });
  }
  acknowledge(context: TenantContext, input: TablePaymentRecord, guard: () => void) {
    const expected = scopedTablePayment(context, input.principal, input);
    return this.writes.run(() => this.storage.forgetResolved(context, expected, guard));
  }
}
