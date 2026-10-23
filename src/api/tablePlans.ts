import { bindPreparedTablePlan, tablePlanPreparedSchema } from './tablePlanPrepared';
import { bindTablePlanResolution, tablePlanResolutionSchema } from './tablePlanResolution';
import {
  scopedTablePlanPreparation,
  type TablePlanPreparation,
} from '../core/tablePlanPreparation';
import { scopedTablePlan, type TablePlanRecord } from '../core/tablePlanRecord';
import { tablePlanPath } from '../core/tablePlanRequest';
import type { CustomerTransport } from '../core/transport';
import type { TenantContext } from '../core/tenantContext';
export async function prepareTablePlan(
  client: CustomerTransport,
  context: TenantContext,
  input: TablePlanPreparation,
  guard: () => void,
  locale: string,
) {
  const preparation = scopedTablePlanPreparation(context, input.principal, input);
  guard();
  const response = await client.request(
    context,
    tablePlanPath + '/prepare',
    tablePlanPreparedSchema,
    {
      method: 'POST',
      credentials: 'table-plan-prepare',
      principal: preparation.principal,
      expectedPlanPreparation: preparation,
      body: preparation.intent,
      assertCurrent: guard,
      locale,
    },
  );
  guard();
  scopedTablePlanPreparation(context, preparation.principal, preparation);
  return bindPreparedTablePlan(preparation.intent, preparation.currency, response);
}
export async function resolveTablePlan(
  client: CustomerTransport,
  context: TenantContext,
  input: TablePlanRecord,
  action: { phase: 'submit'; preparation: TablePlanPreparation } | { phase: 'recover' | 'stop' },
  guard: () => void,
  locale: string,
) {
  const record = scopedTablePlan(context, input.principal, input);
  guard();
  const response = await client.request(
    context,
    tablePlanPath + '/' + action.phase,
    tablePlanResolutionSchema,
    {
      method: 'POST',
      credentials: 'table-plan-operation',
      principal: record.principal,
      expectedPlanRecord: record,
      ...('preparation' in action ? { expectedPlanPreparation: action.preparation } : {}),
      body:
        action.phase === 'submit' ? { intent: record.intent, proof: record.proof } : record.proof,
      assertCurrent: guard,
      locale,
    },
  );
  guard();
  return bindTablePlanResolution(record.intent, response, action.phase);
}
