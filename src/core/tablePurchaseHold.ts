import { TablePlanStorage } from './tablePlanStorage';
import { TableRoundStorage } from './tableRoundStorage';
import { TablePaymentStorage } from './tablePaymentStorage';
import { tablePaymentResolved } from './tablePaymentRecord';
import type { SecretStore, Principal } from './credentials';
import type { TenantContext } from './tenantContext';
export async function assertTablePurchasesResolved(
  store: SecretStore,
  context: TenantContext,
  principal: Principal,
  guard: () => void,
) {
  await new TableRoundStorage(store).assertResolved(context, principal, guard);
  await new TablePaymentStorage(store).assertResolved(context, principal, guard);
  await new TablePlanStorage(store).assertResolved(context, principal, guard);
}
export async function tablePaymentHoldsPurchases(
  store: SecretStore,
  context: TenantContext,
  principal: Principal,
  guard: () => void,
) {
  const contribution = await new TablePaymentStorage(store).read(context, principal, guard);
  return contribution !== null && !tablePaymentResolved(contribution);
}
export async function tablePurchasesHeld(
  store: SecretStore,
  context: TenantContext,
  principal: Principal,
  guard: () => void,
) {
  return (
    (await tablePaymentHoldsPurchases(store, context, principal, guard)) ||
    (await new TableRoundStorage(store).read(context, principal, guard))?.resolution === null ||
    (await new TablePlanStorage(store).read(context, principal, guard))?.resolution === null
  );
}
