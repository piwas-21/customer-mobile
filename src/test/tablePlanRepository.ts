import { tableContributionFixture } from './tablePaymentRepository';
import { roundGuard } from './tableRoundRepository';
import { tablePlanIntent, preparedTablePlan } from './tablePlan';
import { tablePlanPreparationSchema } from '../core/tablePlanPreparation';
export async function tablePlanFixture(customer = false) {
  const f = await tableContributionFixture(customer);
  const preparation = tablePlanPreparationSchema.parse({
    ...f.preparation,
    intent: tablePlanIntent(),
  });
  const prepared = preparedTablePlan();
  const install = () =>
    f.repository.tablePlans.install(f.context, preparation, prepared, roundGuard);
  const resolution = (outcome: 'unseen' | 'applied' | 'stopped') => ({
    schemaVersion: 1,
    operationId: preparation.intent.operationId,
    serviceSessionId: preparation.intent.serviceSessionId,
    outcome,
    planId: outcome === 'applied' ? preparation.intent.operationId : null,
  });
  return { ...f, contribution: f.install, preparation, prepared, install, resolution };
}
